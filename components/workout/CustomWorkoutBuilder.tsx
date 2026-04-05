"use client";

import { GripVertical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const OPENING =
  "Tell me about the workout plan you want to build. You can describe it however feels natural — your goals, how many days, what equipment you have, your experience level, anything.";

type ChatTurn = { role: "user" | "assistant"; content: string };

export type WorkoutExercise = {
  name: string;
  sets: number;
  reps: string;
  rest: string;
  notes: string;
};

export type WorkoutDay = {
  dayName: string;
  focus: string;
  isRestDay: boolean;
  exercises: WorkoutExercise[];
};

export type WorkoutPlan = {
  planName: string;
  description: string;
  daysPerWeek: number;
  days: WorkoutDay[];
};

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

function parseWorkoutFromText(text: string): WorkoutPlan | null {
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
      <div
        className="chat-bubble ai flex items-center gap-1"
        aria-label="Coach is typing"
      >
        <span className="size-1.5 animate-bounce rounded-full bg-[var(--text3)] [animation-delay:0ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-[var(--text3)] [animation-delay:150ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-[var(--text3)] [animation-delay:300ms]" />
      </div>
    </div>
  );
}

export function CustomWorkoutBuilder() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatTurn[]>([
    { role: "assistant", content: OPENING },
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragDayIndex, setDragDayIndex] = useState<number | null>(null);

  async function sendChat() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    const nextMsgs: ChatTurn[] = [...messages, { role: "user", content: text }];
    setMessages(nextMsgs);
    setSending(true);
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
      if (parsed) setPlan(parsed);
      else if (!data.reply.includes("```")) {
        toast.info("Coach replied — keep chatting until a plan appears.");
      }
    } catch {
      toast.error("Network error.");
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  async function savePlan() {
    if (!plan || plan.days.length === 0) {
      toast.error("No plan to save.");
      return;
    }
    setSaving(true);
    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Sign in required.");
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

    const rows = plan.days.map((d, i) => ({
      user_id: user.id,
      day_number: i + 1,
      name: d.dayName.trim() || `Day ${i + 1}`,
    }));

    const { error: insErr } = await supabase.from("workout_splits").insert(rows);
    setSaving(false);

    if (insErr) {
      toast.error(insErr.message);
      return;
    }

    toast.success("Plan saved! Head to Workout to get started.");
    router.push("/workout");
  }

  function updateDay(i: number, patch: Partial<WorkoutDay>) {
    if (!plan) return;
    const days = plan.days.map((d, j) => (j === i ? { ...d, ...patch } : d));
    setPlan({ ...plan, days });
  }

  function updateExercise(dayIndex: number, exIndex: number, patch: Partial<WorkoutExercise>) {
    if (!plan) return;
    const days = plan.days.map((d, j) => {
      if (j !== dayIndex) return d;
      const exercises = d.exercises.map((ex, k) => (k === exIndex ? { ...ex, ...patch } : ex));
      return { ...d, exercises };
    });
    setPlan({ ...plan, days });
  }

  function addExercise(dayIndex: number) {
    if (!plan) return;
    const days = plan.days.map((d, j) =>
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
    setPlan({ ...plan, days });
  }

  function removeExercise(dayIndex: number, exIndex: number) {
    if (!plan) return;
    const days = plan.days.map((d, j) =>
      j === dayIndex
        ? { ...d, exercises: d.exercises.filter((_, k) => k !== exIndex) }
        : d
    );
    setPlan({ ...plan, days });
  }

  function reorderDays(from: number, to: number) {
    if (!plan || from === to) return;
    const days = [...plan.days];
    const [removed] = days.splice(from, 1);
    days.splice(to, 0, removed);
    setPlan({ ...plan, days });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--bg)]">
      <header className="ph shrink-0">
        <Link href="/workout" className="back-btn">
          ← Back
        </Link>
        <h1 className="pt">BUILD A PLAN</h1>
        <p className="ps">Describe your training — Coach builds the structure.</p>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-8 pt-3">
        <div className="max-h-[32vh] min-h-[120px] space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          {messages.map((m, i) => (
            <div
              key={`${i}-${m.role}`}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`chat-bubble ${m.role === "user" ? "user" : "ai"}`}>{m.content}</div>
            </div>
          ))}
          {sending ? <TypingDots /> : null}
        </div>

        {plan ? (
          <div className="space-y-4">
            <Input
              className="bg-[var(--surface2)]"
              value={plan.planName}
              onChange={(e) => setPlan({ ...plan, planName: e.target.value })}
              placeholder="Plan name"
            />
            <textarea
              className="chat-inp min-h-[56px] w-full"
              value={plan.description}
              onChange={(e) => setPlan({ ...plan, description: e.target.value })}
            />
            <label className="flex items-center gap-2 text-xs text-[var(--text2)]">
              Days per week (reference)
              <Input
                type="number"
                className="w-20 bg-[var(--surface2)]"
                value={plan.daysPerWeek}
                onChange={(e) =>
                  setPlan({
                    ...plan,
                    daysPerWeek: Math.max(1, Number(e.target.value) || 1),
                  })
                }
              />
            </label>

            {plan.days.map((day, di) => (
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
                  placeholder="Focus"
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
                            className="min-w-[80px] flex-1 bg-[var(--surface2)]"
                            value={ex.reps}
                            onChange={(e) => updateExercise(di, ei, { reps: e.target.value })}
                            placeholder="Reps"
                          />
                          <Input
                            className="min-w-[80px] flex-1 bg-[var(--surface2)]"
                            value={ex.rest}
                            onChange={(e) => updateExercise(di, ei, { rest: e.target.value })}
                            placeholder="Rest"
                          />
                        </div>
                        <textarea
                          className="chat-inp mb-1 min-h-[48px] w-full text-xs"
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

            <Button
              type="button"
              className="w-full"
              disabled={saving}
              onClick={() => void savePlan()}
            >
              {saving ? "Saving…" : "Save this plan"}
            </Button>
          </div>
        ) : null}

        <div>
          <p className="mb-1 text-xs text-[var(--text2)]">Want to change anything? Just tell me.</p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void sendChat();
            }}
          >
            <input
              className="chat-inp min-w-0 flex-1"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message Coach…"
              disabled={sending}
            />
            <button type="submit" className="chat-send shrink-0" disabled={sending || !draft.trim()}>
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
