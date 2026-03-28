import Link from "next/link";
import { cookies } from "next/headers";

import { CoachTipCard } from "@/components/dashboard/CoachTipCard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { MacroSummaryCard } from "@/components/dashboard/MacroSummaryCard";
import { QuickActionsRow } from "@/components/dashboard/QuickActionsRow";
import { WorkoutDayCard } from "@/components/dashboard/WorkoutDayCard";
import { generateCoachTip } from "@/lib/coach-tip";
import { fetchTodayMacroTotals } from "@/lib/dashboard/food-macros";
import { extractMacroTargets } from "@/lib/dashboard/preferences";
import {
  isTrainingDay,
  parseTrainingDaysPerWeek,
} from "@/lib/dashboard/workout-schedule";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const isGuest = cookies().get("macrofit_guest")?.value === "1";
  if (isGuest) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6">
        <div className="text-center">
          <h1 className="page-title text-4xl sm:text-5xl">Macro Fit</h1>
          <p className="mt-2 max-w-md font-sans text-sm text-muted-foreground">
            You are in guest mode. This dashboard starts empty and stores data
            only on this device.
          </p>
        </div>
        <ButtonAsLink href="/signup">Create Account</ButtonAsLink>
      </div>
    );
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: prefRows } = await supabase
    .from("user_preferences")
    .select("key, value")
    .eq("user_id", user.id);

  const prefList = prefRows ?? [];
  const macroTargets = extractMacroTargets(prefList);
  const prefMap = Object.fromEntries(
    prefList.map((p) => [p.key, p.value] as const)
  );

  const initialTotals = await fetchTodayMacroTotals(supabase, user.id);

  const freqRaw = prefMap.recommended_workout_frequency ?? "";
  const trainingDays = parseTrainingDaysPerWeek(freqRaw);
  const trainToday = isTrainingDay(trainingDays, new Date());

  let coachTip: string | null = null;
  let coachTipError = false;
  try {
    coachTip = await generateCoachTip({
      goal: prefMap.goal ?? "",
      recommended_goal_timeframe: prefMap.recommended_goal_timeframe ?? "",
      recommended_workout_frequency: freqRaw,
    });
  } catch {
    coachTipError = true;
  }

  const displayName = profile?.display_name?.trim() || "Athlete";
  const frequencySummary = freqRaw ? `Plan: ${freqRaw}` : "";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6 pb-12">
      <DashboardHeader displayName={displayName} />
      <MacroSummaryCard
        userId={user.id}
        targets={macroTargets}
        initialTotals={initialTotals}
      />
      <WorkoutDayCard
        isTrainingDay={trainToday}
        frequencySummary={frequencySummary}
      />
      <QuickActionsRow />
      <CoachTipCard tip={coachTip} errorFallback={coachTipError} />
    </div>
  );
}

function ButtonAsLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 py-2 font-heading text-sm uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90"
    >
      {children}
    </Link>
  );
}
