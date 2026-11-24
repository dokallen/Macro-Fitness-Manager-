/**
 * What the Coach knows about the user's numbers (Phase 2.7), and the server
 * function it uses to propose targets. A formula sets the numbers; the Coach
 * explains them and never invents them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { describeResult, type CalcResult } from "@/lib/coaching/calc";
import {
  loadCheckInData,
  validTimeZone,
  parseCheckInRecord,
  runCalculation,
  type CheckInData,
  type CheckInRecord,
} from "@/lib/coaching/check-in";
import { describeGoalPace, readGoalPace } from "@/lib/coaching/goal-pace";
import { readOwnTargets } from "@/lib/coaching/own-targets";
import { checkInRecordDates, checkInRecordKey } from "@/lib/coaching/schedule";
import { setMacroTargets } from "@/lib/coach-actions/macro-targets";
import type { CoachProposal } from "@/lib/coach-actions/types";
import { trackedMetrics } from "@/lib/metrics/tracked";
import { calendarDateIn, describeProfileForAi, readProfile } from "@/lib/profile/profile";
import { ymdInZone } from "@/lib/coaching/ymd";
import type { Database, Json } from "@/lib/types";

type Client = SupabaseClient<Database>;

/** How many recent entries per tracked metric the Coach sees. */
export const CONTEXT_ENTRIES_PER_METRIC = 8;
/** How many recent check-in records the Coach sees. */
export const CONTEXT_CHECK_INS = 4;

export type MetricHistory = { name: string; unit: string; entries: { date: string; value: number; unit: string }[] };

/** The Coach's data block, from already-loaded data (pure, for tests). */
export function buildCoachDataContext(
  data: CheckInData,
  metrics: readonly MetricHistory[],
  calc: CalcResult,
  now: Date
): string {
  const profile = describeProfileForAi(readProfile(data.prefs), calendarDateIn(now, data.timeZone));
  const pace = describeGoalPace(readGoalPace(data.prefs));
  const records: { date: string; record: CheckInRecord | null }[] = checkInRecordDates(data.prefs)
    .slice(-CONTEXT_CHECK_INS)
    .map((date) => ({ date, record: parseCheckInRecord(data.prefs.find((p) => p.key === checkInRecordKey(date))?.value) }));
  const status =
    data.status.state === "none"
      ? "no check-in schedule set"
      : data.status.state === "late" || data.status.state === "missed"
        ? `${data.status.state} (${data.status.daysLate} days since ${data.status.dueDate})`
        : `${data.status.state} (next check-in ${data.status.dueDate})`;
  const u = calc.weightUnit;

  const lines = [
    "",
    "USER DATA (from the app; use these numbers, never invent your own):",
    `Today: ${data.today}`,
    `Profile: age ${profile.age}; height ${profile.height}; biological sex ${profile.biologicalSex}; activity level ${profile.activityLevel}; goal weight ${profile.goalWeight}.`,
    `Goal pace: ${pace}.`,
    `Current targets: ${data.targets.length ? data.targets.map((t) => `${t.key} = ${t.displayValue}`).join("; ") : "none"}.`,
    (() => {
      const own = readOwnTargets(data.prefs);
      return own
        ? `Targets are the user's own numbers since ${own.setAt.slice(0, 10)} (reason: ${own.reason}).`
        : "Targets come from onboarding or the calculation.";
    })(),
    `Trend weight: ${calc.trendWeight !== null ? `${calc.trendWeight.toFixed(1)} ${u}` : "not enough weigh-ins"}.`,
    `Estimated calorie burn: ${calc.estimatedBurn !== null ? `${Math.round(calc.estimatedBurn)} kcal/day` : "not enough data"}.`,
    `Check-in status: ${status}.`,
  ];
  if (metrics.length) {
    lines.push("Recent entries per tracked metric (newest first):");
    for (const m of metrics) {
      lines.push(
        `- ${m.name}: ${
          m.entries.length ? m.entries.map((e) => `${e.date} ${e.value}${e.unit ? ` ${e.unit}` : ""}`).join(", ") : "no entries"
        }`
      );
    }
  }
  if (records.length) {
    lines.push("Last check-ins:");
    for (const { date, record } of records) {
      if (!record) continue;
      lines.push(
        `- ${date}: ${record.decision === "change" ? "changed targets" : "held steady"}; ${record.reason}` +
          (record.trendWeight !== null ? ` Trend ${record.trendWeight} ${record.weightUnit}.` : "") +
          (record.averageIntake !== null ? ` Intake ${record.averageIntake} kcal.` : "") +
          ` Logging: ${record.loggingAnswer}.`
      );
    }
  }
  return lines.join("\n");
}

/** Loads everything and builds the Coach's data block. */
export async function loadCoachDataContext(
  supabase: Client,
  userId: string,
  now: Date,
  preloadedPrefs?: readonly { key: string; value: string | null }[],
  /** The device's time zone, so the Coach and the check-in card agree. */
  clientTimeZone?: string | null
): Promise<{ text: string; data: CheckInData }> {
  const prefsForMetrics = preloadedPrefs
    ? preloadedPrefs.map((p) => ({ key: p.key, value: p.value ?? "" }))
    : null;
  // One query per metric (last 8 each), in parallel with the check-in data.
  const loadHistories = async (prefs: { key: string; value: string }[], tz: string | null) =>
    Promise.all(
      trackedMetrics(prefs).map(async (m): Promise<MetricHistory> => {
        const { data: rows, error } = await supabase
          .from("progress_entries")
          .select("value, unit, logged_at")
          .eq("user_id", userId)
          .eq("metric_key", m.name)
          .order("logged_at", { ascending: false })
          .limit(CONTEXT_ENTRIES_PER_METRIC);
        if (error) throw new Error(error.message);
        return {
          name: m.name,
          unit: m.unit,
          entries: (rows ?? []).map((r) => ({
            date: ymdInZone(new Date(r.logged_at), tz),
            value: Number(r.value),
            unit: r.unit ?? "",
          })),
        };
      })
    );
  const tzFromPrefs = (prefs: { key: string; value: string }[]) =>
    prefs.find((p) => p.key === "notification_timezone")?.value || null;
  const [data, early] = await Promise.all([
    loadCheckInData(supabase, userId, now, clientTimeZone ?? null, preloadedPrefs),
    prefsForMetrics
      ? loadHistories(prefsForMetrics, validTimeZone(clientTimeZone) ?? tzFromPrefs(prefsForMetrics))
      : Promise.resolve(null),
  ]);
  const histories = early ?? (await loadHistories(data.prefs, data.timeZone));
  const calc = runCalculation(data, null);
  return { text: buildCoachDataContext(data, histories, calc, now), data };
}

// ------------------------------------------------- "adjust my macros" tool

export const CALCULATED_TARGETS_TOOL = {
  name: "propose_calculated_targets",
  description:
    "Run the app's target calculation (trend weight, logged intake, estimated burn, goal pace) and propose the result as a card the user can Apply or Cancel, or report why targets should hold steady. Use this whenever the user asks to adjust, recalculate or update their macros or calories outside a check-in. Never calculate targets yourself.",
  input_schema: { type: "object" as const, properties: {} },
};

/** Read-only: lets the Coach compare the user's own numbers with the calculation. */
export const GET_CALCULATED_TARGETS_TOOL = {
  name: "get_calculated_targets",
  description:
    "Look up what the app's calculation gives for the user's targets right now (or why it would hold steady), without proposing anything. Use it before discussing numbers the user wants to set themselves, so you can compare them honestly.",
  input_schema: { type: "object" as const, properties: {} },
};

/**
 * The server-side calculation for "adjust my macros". Outside a check-in there
 * is no logging answer, so that rule is skipped.
 */
export function calculatedTargetsProposal(
  data: CheckInData,
  makeId: () => string
): { proposal: CoachProposal | null; resultText: string; result: CalcResult } {
  const result = runCalculation(data, null);
  if (result.decision !== "change") {
    return { proposal: null, resultText: describeResult(result), result };
  }
  const parsed = setMacroTargets.schema.safeParse({
    targets: result.changes.map((c) => ({ key: c.key, value: c.to, ...(c.unit ? { unit: c.unit } : {}) })),
    source: "calculated",
  });
  if (!parsed.success) {
    return { proposal: null, resultText: "Holding targets steady: the calculated targets could not be used.", result };
  }
  return {
    proposal: {
      id: makeId(),
      action: setMacroTargets.name,
      input: parsed.data as unknown as Json,
      summary: setMacroTargets.summarize(parsed.data),
      status: "pending",
    },
    resultText: describeResult(result),
    result,
  };
}

// ------------------------------------------------------- system prompt rules

/** Added to the Coach system prompt (Phase 2.7). */
export const COACH_TARGET_RULES = [
  "",
  "Target rules:",
  "- Only use calculated numbers for macro or calorie targets. To change targets, call propose_calculated_targets; never work out new targets yourself and never invent numbers.",
  "- Use set_macro_targets only for exact values the user states themselves, never for numbers you chose.",
  "- When the user wants to change their targets: first check their goal is still right (goal weight, goal pace, activity level; if any changed, propose update_profile and then recalculate). Then ask whether they want the calculated targets or their own numbers.",
  "- If they want their own numbers: call get_calculated_targets, tell them plainly what their numbers mean compared with the calculation (for example that a higher calorie target will slow or stop progress), and ask what changed. Only after they answer, propose set_macro_targets with their reason. It is their choice; be honest, not pushy.",
  "- Targets should be realistic for the goal. Do not encourage making targets easier without a real change in goal or lifestyle.",
  "- If the user has no targets yet, the calculation can't run (it starts from a calorie target). Ask for their starting numbers and propose those with set_macro_targets and their reason; later check-ins adjust them.",
  "- Propose changes only when the user asks or clearly agrees, or in a check-in review.",
  "- Nothing changes until the user taps Apply. Never say a change was made before it is applied.",
  "- If profile information is missing (for example date of birth or goal pace), you may ask for it once. If the user declines, accept that and do not ask again.",
].join("\n");

/** Used instead of the data block when the user's numbers could not be loaded. */
export const COACH_TARGETS_UNAVAILABLE =
  "\nTarget calculation is unavailable right now. Do not propose target changes unless the user states exact values; say you can recalculate later.";

// ------------------------------------------------------- check-in review

/** The request for the Coach's short review after a check-in (pure, for tests). */
export function buildCheckInReviewRequest(
  record: CheckInRecord,
  resultText: string
): { system: string; user: string } {
  return {
    system: [
      "You are the user's fitness coach. Write a short review of their weekly check-in, 3 to 5 sentences, plain text.",
      "Say what was reviewed, what was decided and why.",
      "Use only the numbers given below. Do not calculate, estimate or invent any number.",
      record.decision === "change"
        ? "The new targets are shown to the user as a card with Apply and Cancel. Say they can apply them. Do not say they were changed."
        : "Targets are holding steady. Explain the reason given.",
    ].join("\n"),
    user: `Check-in data (JSON):\n${JSON.stringify(record, null, 2)}\n\nSummary: ${resultText}`,
  };
}
