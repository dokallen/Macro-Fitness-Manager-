"use client";

import { GripVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type ChatTurn = { role: "user" | "assistant"; content: string };

type WorkoutExercise = {
  name: string;
  sets: number;
  reps: string;
  rest: string;
  notes: string;
};

type WorkoutDay = {
  dayName: string;
  focus: string;
  isRestDay: boolean;
  exercises: WorkoutExercise[];
};

type ParsedPlan = {
  planName: string;
  description: string;
  daysPerWeek: number;
  days: WorkoutDay[];
};

type EditablePlan = ParsedPlan;

const EXISTING_OPENING =
  "Tell me about your current program. What does your week look like? You can describe it however feels natural — days, exercises, splits, anything.";

const GOAL_OPTIONS = [
  "",
  "Fat Loss",
  "Build Muscle",
  "Body Recomposition",
  "Improve Endurance",
  "Athletic Performance",
  "General Fitness",
] as const;

const DAYS_OPTIONS = ["", "2 days", "3 days", "4 days", "5 days", "6 days"] as const;

const EQUIP_OPTIONS = [
  "",
  "Full Commercial Gym",
  "Dumbbells Only",
  "Barbell + Rack at Home",
  "Bodyweight Only",
  "Resistance Bands",
  "Cables + Machines Only",
] as const;

const EXP_OPTIONS = [
  "",
  "Beginner (0-1 year)",
  "Intermediate (1-3 years)",
  "Advanced (3+ years)",
] as const;

function extractJsonBlob(text: string): string | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\" && inStr) {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseWorkoutFromText(text: string): ParsedPlan | null {
  const blob = extractJsonBlob(text);
  if (!blob) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(blob);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const planName = String(o.planName ?? "").trim();
  const description = String(o.description ?? "").trim();
  const daysPerWeek = Number(o.daysPerWeek);
  const daysRaw = o.days;
  if (!planName || !Number.isFinite(daysPerWeek) || daysPerWeek < 1) return null;
  if (!Array.isArray(daysRaw) || daysRaw.length === 0) return null;

  const days: WorkoutDay[] = [];
  for (const d of daysRaw) {
    if (!d || typeof d !== "object") continue;
    const row = d as Record<string, unknown>;
    const dayName = String(row.dayName ?? "").trim();
    const focus = String(row.focus ?? "").trim();
    const isRestDay = Boolean(row.isRestDay);
    const exRaw = row.exercises;
    const exercises: WorkoutExercise[] = [];
    if (Array.isArray(exRaw)) {
      for (const e of exRaw) {
        if (!e || typeof e !== "object") continue;
        const er = e as Record<string, unknown>;
        const name = String(er.name ?? "").trim();
        const sets = Number(er.sets);
        const reps = String(er.reps ?? "");
        const rest = String(er.rest ?? "");
        const notes = String(er.notes ?? "");
        exercises.push({
          name,
          sets: Number.isFinite(sets) && sets > 0 ? sets : 1,
          reps,
          rest,
          notes,
        });
      }
    }
    days.push({
      dayName: dayName || `Day ${days.length + 1}`,
      focus,
      isRestDay,
      exercises: isRestDay ? [] : exercises,
    });
  }
  if (days.length === 0) return null;
  return { planName, description, daysPerWeek, days };
}

function TypingDots() {
  return (
    <div className="flex justify-start">
      <div className="chat-bubble ai flex items-center gap-1" aria-label="Coach is typing">
        <span className="size-1.5 animate-bounce rounded-full bg-[var(--text3)] [animation-delay:0ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-[var(--text3)] [animation-delay:150ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-[var(--text3)] [animation-delay:300ms]" />
      </div>
    </div>
  );
}

function splitDisplayName(day: WorkoutDay, index: number): string {
  const dn = day.dayName.trim() || `Day ${index + 1}`;
  const f = day.focus.trim();
  if (f) return `${dn} — ${f}`;
  return dn;
}

type GuidedAnswersState = {
  goal: string;
  daysPerWeek: string;
  equipment: string;
  experience: string;
  injuries: string;
};

type Props = { userId: string };

export function WorkoutOnboarding({ userId }: Props) {
  const router = useRouter();
  const [path, setPath] = useState<null | "existing" | "new">(null);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<ParsedPlan | null>(null);
  const [editablePlan, setEditablePlan] = useState<EditablePlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragDayIndex, setDragDayIndex] = useState<number | null>(null);

  const [guidedStep, setGuidedStep] = useState(0);
  const [guidedQSelect, setGuidedQSelect] = useState("");
  const [guidedQText, setGuidedQText] = useState("");
  const [, setGuidedAnswers] = useState<GuidedAnswersState>({
    goal: "",
    daysPerWeek: "",
    equipment: "",
    experience: "",
    injuries: "",
  });

  const effectivePlan = editablePlan ?? plan;

  function startExisting() {
    setPath("existing");
    setMessages([
      { role: "assistant", content: EXISTING_OPENING },
    ]);
  }

  function startNew() {
    setPath("new");
    setGuidedStep(0);
    setGuidedQSelect("");
    setGuidedQText("");
    setGuidedAnswers({
      goal: "",
      daysPerWeek: "",
      equipment: "",
      experience: "",
      injuries: "",
    });
  }

  async function sendWorkoutChat(nextMsgs: ChatTurn[]) {
    setLoading(true);
    try {
      const res = await fetch("/api/workout-plan-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMsgs }),
      });
      const data = (await res.json()) as { error?: string; reply?: string };
      if (!res.ok || !data.reply) {
        toast.error(data.error ?? "Could not reach Coach.");
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: data.reply! }]);
      const parsed = parseWorkoutFromText(data.reply);
      if (parsed) {
        setPlan(parsed);
        setEditablePlan(structuredClone(parsed));
      }
    } catch {
      toast.error("Network error.");
    } finally {
      setLoading(false);
    }
  }

  async function sendChatFromDraft() {
    const text = draft.trim();
    if (!text || loading) return;
    setDraft("");
    const nextMsgs: ChatTurn[] = [...messages, { role: "user", content: text }];
    setMessages(nextMsgs);
    await sendWorkoutChat(nextMsgs);
  }

  function mergeAnswerAndAdvance(field: keyof GuidedAnswersState, value: string) {
    setGuidedAnswers((a) => ({ ...a, [field]: value }));
    setGuidedQSelect("");
    setGuidedQText("");
    setGuidedStep((s) => s + 1);
  }

  async function runGuidedBuildWithAnswers(answers: GuidedAnswersState) {
    setGuidedStep(5);
    setLoading(true);
    try {
      const res = await fetch("/api/workout-plan-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "guided_onboarding",
          guidedAnswers: answers,
        }),
      });
      const data = (await res.json()) as { error?: string; reply?: string };
      if (!res.ok || !data.reply) {
        toast.error(data.error ?? "Could not build plan.");
        setGuidedStep(4);
        return;
      }
      const parsed = parseWorkoutFromText(data.reply);
      if (!parsed) {
        toast.error("Coach returned something we could not parse. Try again.");
        setGuidedStep(4);
        return;
      }
      setPlan(parsed);
      setEditablePlan(structuredClone(parsed));
    } catch {
      toast.error("Network error.");
      setGuidedStep(4);
    } finally {
      setLoading(false);
    }
  }

  function finishGuidedWithInjuries(injuriesVal: string) {
    setGuidedAnswers((prev) => {
      const next = { ...prev, injuries: injuriesVal };
      void runGuidedBuildWithAnswers(next);
      return next;
    });
  }

  function guidedNext() {
    if (guidedStep === 0) {
      const v = guidedQText.trim() || guidedQSelect.trim();
      if (!v) {
        toast.error("Choose an option or describe your goal.");
        return;
      }
      mergeAnswerAndAdvance("goal", v);
      return;
    }
    if (guidedStep === 1) {
      const v = guidedQText.trim() || guidedQSelect.trim();
      if (!v) {
        toast.error("Choose days per week or enter your own.");
        return;
      }
      mergeAnswerAndAdvance("daysPerWeek", v);
      return;
    }
    if (guidedStep === 2) {
      const v = guidedQText.trim() || guidedQSelect.trim();
      if (!v) {
        toast.error("Choose equipment or describe your setup.");
        return;
      }
      mergeAnswerAndAdvance("equipment", v);
      return;
    }
    if (guidedStep === 3) {
      const v = guidedQText.trim() || guidedQSelect.trim();
      if (!v) {
        toast.error("Choose experience or describe it.");
        return;
      }
      mergeAnswerAndAdvance("experience", v);
      return;
    }
  }

  function guidedSkipInjuries() {
    finishGuidedWithInjuries("None");
  }

  function guidedSubmitInjuries() {
    const v = guidedQText.trim() || "None";
    setGuidedQText("");
    finishGuidedWithInjuries(v);
  }

  async function savePlan(label: string) {
    const p = editablePlan;
    if (!p || p.days.length === 0) {
      toast.error("No plan to save.");
      return;
    }
    setSaving(true);
    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id !== userId) {
      toast.error("Session mismatch. Sign in again.");
      setSaving(false);
      return;
    }

    const { error: delErr } = await supabase
      .from("workout_splits")
      .delete()
      .eq("user_id", user.id);

    if (delErr) {
      toast.error(delErr.message);
      setSaving(false);
      return;
    }

    const rows = p.days.map((d, i) => ({
      user_id: user.id,
      day_number: i + 1,
      name: splitDisplayName(d, i),
    }));

    const { error: insErr } = await supabase.from("workout_splits").insert(rows);
    setSaving(false);

    if (insErr) {
      toast.error(insErr.message);
      return;
    }

    toast.success(label);
    router.refresh();
  }

  function updateDay(i: number, patch: Partial<WorkoutDay>) {
    if (!editablePlan) return;
    const days = editablePlan.days.map((d, j) => (j === i ? { ...d, ...patch } : d));
    setEditablePlan({ ...editablePlan, days });
  }

  function updateExercise(dayIndex: number, exIndex: number, patch: Partial<WorkoutExercise>) {
    if (!editablePlan) return;
    const days = editablePlan.days.map((d, j) => {
      if (j !== dayIndex) return d;
      const exercises = d.exercises.map((ex, k) => (k === exIndex ? { ...ex, ...patch } : ex));
      return { ...d, exercises };
    });
    setEditablePlan({ ...editablePlan, days });
  }

  function addExercise(dayIndex: number) {
    if (!editablePlan) return;
    const days = editablePlan.days.map((d, j) =>
      j === dayIndex
        ? {
            ...d,
            exercises: [
              ...d.exercises,
              { name: "", sets: 3, reps: "", rest: "", notes: "" },
            ],
          }
        : d
    );
    setEditablePlan({ ...editablePlan, days });
  }

  function removeExercise(dayIndex: number, exIndex: number) {
    if (!editablePlan) return;
    const days = editablePlan.days.map((d, j) =>
      j === dayIndex
        ? { ...d, exercises: d.exercises.filter((_, k) => k !== exIndex) }
        : d
    );
    setEditablePlan({ ...editablePlan, days });
  }

  function reorderDays(from: number, to: number) {
    if (!editablePlan || from === to) return;
    const days = [...editablePlan.days];
    const [removed] = days.splice(from, 1);
    days.splice(to, 0, removed);
    setEditablePlan({ ...editablePlan, days });
  }

  async function followUpChat() {
    const text = draft.trim();
    if (!text || loading || !effectivePlan) return;
    setDraft("");
    const planContext = JSON.stringify(effectivePlan);
    const nextMsgs: ChatTurn[] = [
      ...messages,
      {
        role: "user",
        content: `${text}\n\n(Current plan JSON for reference — return the full updated plan in a code block.)\n${planContext}`,
      },
    ];
    setMessages(nextMsgs);
    setLoading(true);
    try {
      const res = await fetch("/api/workout-plan-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMsgs }),
      });
      const data = (await res.json()) as { error?: string; reply?: string };
      if (!res.ok || !data.reply) {
        toast.error(data.error ?? "Could not reach Coach.");
        setDraft(text);
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: data.reply! }]);
      const parsed = parseWorkoutFromText(data.reply);
      if (parsed) setEditablePlan(structuredClone(parsed));
    } catch {
      toast.error("Network error.");
      setDraft(text);
    } finally {
      setLoading(false);
    }
  }

  const cardBase: CSSProperties = {
    background: "var(--surface)",
    border: "1.5px solid var(--border)",
    borderRadius: 16,
    padding: "20px 16px",
    cursor: "pointer",
    transition: "border-color 0.2s",
  };

  if (path === null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--bg)]">
        <header className="ph shrink-0">
          <h1 className="pt">LET&apos;S BUILD YOUR PLAN</h1>
          <p className="ps">Tell Coach about your training so we can get you set up.</p>
        </header>
        <div className="flex flex-col items-center px-4 pb-10 pt-6">
          <div className="mb-6 text-6xl" aria-hidden>
            🏋🏾
          </div>
          <div className="grid w-full max-w-lg gap-4 sm:grid-cols-2">
            <button
              type="button"
              style={cardBase}
              className="text-left hover:border-[var(--accent)] active:border-[var(--accent)]"
              onClick={startExisting}
            >
              <div className="text-2xl" aria-hidden>
                📋
              </div>
              <p className="mt-2 font-semibold text-[var(--text)]">I have a program</p>
              <p className="mt-1 text-sm text-[var(--text2)]">
                Already following a plan? Let&apos;s load it in.
              </p>
            </button>
            <button
              type="button"
              style={cardBase}
              className="text-left hover:border-[var(--accent)] active:border-[var(--accent)]"
              onClick={startNew}
            >
              <div className="text-2xl" aria-hidden>
                ✨
              </div>
              <p className="mt-2 font-semibold text-[var(--text)]">Build something new</p>
              <p className="mt-1 text-sm text-[var(--text2)]">
                Answer a few questions and Coach will create your plan.
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (path === "new" && guidedStep >= 5 && loading && !effectivePlan) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-[var(--bg)] px-6">
        <p className="ps text-center">Coach is building your plan…</p>
        <TypingDots />
      </div>
    );
  }

  if (path === "new" && guidedStep < 5 && !effectivePlan) {
    const fadeStyle: CSSProperties = {
      opacity: 1,
      transition: "opacity 0.35s ease-out",
    };

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--bg)]">
        <header className="ph shrink-0">
          <button type="button" className="back-btn" onClick={() => setPath(null)}>
            ← Back
          </button>
          <h1 className="pt">LET&apos;S BUILD YOUR PLAN</h1>
          <p className="ps">Step {guidedStep + 1} of 5</p>
        </header>
        <div key={guidedStep} className="px-4 pb-8 pt-4" style={fadeStyle}>
          {guidedStep === 0 ? (
            <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm font-medium text-[var(--text)]">What&apos;s your main goal?</p>
              <select
                className="inf"
                value={guidedQSelect}
                onChange={(e) => setGuidedQSelect(e.target.value)}
              >
                {GOAL_OPTIONS.map((o) => (
                  <option key={o || "placeholder"} value={o}>
                    {o || "Choose from list…"}
                  </option>
                ))}
              </select>
              <input
                className="inf"
                value={guidedQText}
                onChange={(e) => setGuidedQText(e.target.value)}
                placeholder="Or describe your goal…"
              />
              <Button type="button" className="w-full" onClick={guidedNext}>
                Next
              </Button>
            </div>
          ) : null}

          {guidedStep === 1 ? (
            <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm font-medium text-[var(--text)]">
                How many days per week can you train?
              </p>
              <select
                className="inf"
                value={guidedQSelect}
                onChange={(e) => setGuidedQSelect(e.target.value)}
              >
                {DAYS_OPTIONS.map((o) => (
                  <option key={o || "ph"} value={o}>
                    {o || "Choose from list…"}
                  </option>
                ))}
              </select>
              <input
                className="inf"
                value={guidedQText}
                onChange={(e) => setGuidedQText(e.target.value)}
                placeholder="Or enter a number…"
              />
              <Button type="button" className="w-full" onClick={guidedNext}>
                Next
              </Button>
            </div>
          ) : null}

          {guidedStep === 2 ? (
            <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm font-medium text-[var(--text)]">
                What equipment do you have access to?
              </p>
              <select
                className="inf"
                value={guidedQSelect}
                onChange={(e) => setGuidedQSelect(e.target.value)}
              >
                {EQUIP_OPTIONS.map((o) => (
                  <option key={o || "ph"} value={o}>
                    {o || "Choose from list…"}
                  </option>
                ))}
              </select>
              <input
                className="inf"
                value={guidedQText}
                onChange={(e) => setGuidedQText(e.target.value)}
                placeholder="Or describe your setup…"
              />
              <Button type="button" className="w-full" onClick={guidedNext}>
                Next
              </Button>
            </div>
          ) : null}

          {guidedStep === 3 ? (
            <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm font-medium text-[var(--text)]">
                What&apos;s your experience level?
              </p>
              <select
                className="inf"
                value={guidedQSelect}
                onChange={(e) => setGuidedQSelect(e.target.value)}
              >
                {EXP_OPTIONS.map((o) => (
                  <option key={o || "ph"} value={o}>
                    {o || "Choose from list…"}
                  </option>
                ))}
              </select>
              <input
                className="inf"
                value={guidedQText}
                onChange={(e) => setGuidedQText(e.target.value)}
                placeholder="Or describe your experience…"
              />
              <Button type="button" className="w-full" onClick={guidedNext}>
                Next
              </Button>
            </div>
          ) : null}

          {guidedStep === 4 ? (
            <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm font-medium text-[var(--text)]">
                Any injuries or physical limitations Coach should know about?
              </p>
              <textarea
                className="inf min-h-[88px] resize-y"
                value={guidedQText}
                onChange={(e) => setGuidedQText(e.target.value)}
                placeholder="Describe any limitations…"
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="secondary" className="flex-1" onClick={guidedSkipInjuries}>
                  None, I&apos;m good to go
                </Button>
                <Button type="button" className="flex-1" onClick={guidedSubmitInjuries}>
                  Continue
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const showPlanEditor = effectivePlan !== null;
  const saveLabel =
    path === "new" ? "Looks good, save it" : "Save this plan";
  const toastMsg = "Plan saved! Let's get to work.";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--bg)]">
      <header className="ph shrink-0">
        <button type="button" className="back-btn" onClick={() => setPath(null)}>
          ← Back
        </button>
        <h1 className="pt">LET&apos;S BUILD YOUR PLAN</h1>
        <p className="ps">
          {path === "existing" ? "Describe your program, then refine with Coach." : "Review and save when ready."}
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-8 pt-3">
        {path === "existing" ? (
          <div className="max-h-[28vh] min-h-[100px] space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            {messages.map((m, i) => (
              <div
                key={`${i}-${m.role}`}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`chat-bubble ${m.role === "user" ? "user" : "ai"}`}>{m.content}</div>
              </div>
            ))}
            {loading ? <TypingDots /> : null}
          </div>
        ) : null}

        {path === "existing" && !showPlanEditor ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void sendChatFromDraft();
            }}
          >
            <input
              className="chat-inp min-w-0 flex-1"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Describe your week…"
              disabled={loading}
            />
            <button type="submit" className="chat-send shrink-0" disabled={loading || !draft.trim()}>
              Send
            </button>
          </form>
        ) : null}

        {showPlanEditor && editablePlan ? (
          <div className="space-y-4">
            <Input
              className="bg-[var(--surface2)]"
              value={editablePlan.planName}
              onChange={(e) => setEditablePlan({ ...editablePlan, planName: e.target.value })}
              placeholder="Plan name"
            />
            <textarea
              className="chat-inp min-h-[56px] w-full"
              value={editablePlan.description}
              onChange={(e) => setEditablePlan({ ...editablePlan, description: e.target.value })}
            />
            <label className="flex items-center gap-2 text-xs text-[var(--text2)]">
              Days per week
              <Input
                type="number"
                className="w-20 bg-[var(--surface2)]"
                value={editablePlan.daysPerWeek}
                onChange={(e) =>
                  setEditablePlan({
                    ...editablePlan,
                    daysPerWeek: Math.max(1, Number(e.target.value) || 1),
                  })
                }
              />
            </label>

            {editablePlan.days.map((day, di) => (
              <div
                key={di}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragDayIndex === null) return;
                  reorderDays(dragDayIndex, di);
                  setDragDayIndex(null);
                }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <div
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={() => setDragDayIndex(di)}
                    onDragEnd={() => setDragDayIndex(null)}
                    className="cursor-grab touch-none text-[var(--text2)] active:cursor-grabbing"
                    aria-label="Reorder day"
                  >
                    <GripVertical className="size-5" />
                  </div>
                  <Input
                    className="flex-1 bg-[var(--surface2)]"
                    value={day.dayName}
                    onChange={(e) => updateDay(di, { dayName: e.target.value })}
                  />
                  <label className="flex shrink-0 items-center gap-1 text-xs text-[var(--text2)]">
                    <input
                      type="checkbox"
                      checked={day.isRestDay}
                      onChange={(e) =>
                        updateDay(di, {
                          isRestDay: e.target.checked,
                          exercises: e.target.checked ? [] : day.exercises,
                        })
                      }
                    />
                    Rest
                  </label>
                </div>
                <Input
                  className="mb-2 bg-[var(--surface2)]"
                  value={day.focus}
                  onChange={(e) => updateDay(di, { focus: e.target.value })}
                  placeholder="Focus / description"
                />

                {!day.isRestDay ? (
                  <div className="space-y-2">
                    {day.exercises.map((ex, ei) => (
                      <div
                        key={ei}
                        className="rounded-lg border border-[var(--border)] p-2 text-xs"
                      >
                        <Input
                          className="mb-1 bg-[var(--surface2)]"
                          value={ex.name}
                          onChange={(e) => updateExercise(di, ei, { name: e.target.value })}
                          placeholder="Exercise name"
                        />
                        <div className="mb-1 flex flex-wrap gap-1">
                          <Input
                            type="number"
                            className="w-16 bg-[var(--surface2)]"
                            value={ex.sets}
                            onChange={(e) =>
                              updateExercise(di, ei, {
                                sets: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                          />
                          <Input
                            className="min-w-[72px] flex-1 bg-[var(--surface2)]"
                            value={ex.reps}
                            onChange={(e) => updateExercise(di, ei, { reps: e.target.value })}
                            placeholder="Reps"
                          />
                          <Input
                            className="min-w-[72px] flex-1 bg-[var(--surface2)]"
                            value={ex.rest}
                            onChange={(e) => updateExercise(di, ei, { rest: e.target.value })}
                            placeholder="Rest"
                          />
                        </div>
                        <textarea
                          className="chat-inp mb-1 min-h-[44px] w-full text-xs"
                          value={ex.notes}
                          onChange={(e) => updateExercise(di, ei, { notes: e.target.value })}
                          placeholder="Notes"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => removeExercise(di, ei)}
                        >
                          Remove exercise
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="secondary" size="sm" onClick={() => addExercise(di)}>
                      Add exercise
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}

            <p className="text-xs text-[var(--text2)]">Want to change anything? Just tell Coach.</p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void followUpChat();
              }}
            >
              <input
                className="chat-inp min-w-0 flex-1"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Message Coach…"
                disabled={loading}
              />
              <button type="submit" className="chat-send shrink-0" disabled={loading || !draft.trim()}>
                Send
              </button>
            </form>

            <button
              type="button"
              className="save-btn"
              disabled={saving}
              onClick={() => void savePlan(toastMsg)}
            >
              {saving ? "Saving…" : saveLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
