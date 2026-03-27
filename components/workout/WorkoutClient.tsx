"use client";

import { ChevronDown, Dumbbell } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type WorkoutSplit = {
  id: string;
  day_number: number;
  name: string;
};

type WorkoutSet = {
  id: string;
  session_id: string;
  exercise_name: string;
  sets: number;
  reps: number;
  weight: number | null;
  unit: string;
};

type WorkoutSession = {
  id: string;
  split_id: string | null;
  logged_at: string;
  notes: string | null;
  workout_sets: WorkoutSet[] | null;
};

type Props = {
  userId: string;
};

export function WorkoutClient({ userId }: Props) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [splits, setSplits] = useState<WorkoutSplit[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingSplitId, setStartingSplitId] = useState<string | null>(null);
  const [savingSet, setSavingSet] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const [exerciseName, setExerciseName] = useState("");
  const [setCount, setSetCount] = useState("");
  const [repCount, setRepCount] = useState("");
  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState<"lbs" | "kg">("lbs");

  const activeSession = useMemo(
    () => (activeSessionId ? sessions.find((s) => s.id === activeSessionId) ?? null : null),
    [activeSessionId, sessions]
  );

  const activeSets = useMemo(() => activeSession?.workout_sets ?? [], [activeSession]);
  const splitById = useMemo(
    () => new Map(splits.map((s) => [s.id, s] as const)),
    [splits]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      setLoading(true);

      const [splitsRes, sessionsRes] = await Promise.all([
        supabase
          .from("workout_splits")
          .select("id, day_number, name")
          .eq("user_id", userId)
          .order("day_number"),
        supabase
          .from("workout_sessions")
          .select(
            "id, split_id, logged_at, notes, workout_sets(id, session_id, exercise_name, sets, reps, weight, unit)"
          )
          .eq("user_id", userId)
          .order("logged_at", { ascending: false }),
      ]);

      if (cancelled) return;

      if (splitsRes.error) {
        console.error(splitsRes.error);
      } else {
        setSplits(splitsRes.data ?? []);
      }

      if (sessionsRes.error) {
        console.error(sessionsRes.error);
      } else {
        setSessions((sessionsRes.data ?? []) as WorkoutSession[]);
      }

      setLoading(false);
    }

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  async function startSession(split: WorkoutSplit) {
    setStartingSplitId(split.id);
    const { data, error } = await supabase
      .from("workout_sessions")
      .insert({
        user_id: userId,
        split_id: split.id,
        logged_at: new Date().toISOString(),
      })
      .select("id, split_id, logged_at, notes")
      .single();

    setStartingSplitId(null);
    if (error || !data) {
      toast.error(error?.message ?? "Could not start session.");
      return;
    }

    const session: WorkoutSession = {
      ...(data as Omit<WorkoutSession, "workout_sets">),
      workout_sets: [],
    };
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
    setExpandedSessionId(session.id);
    toast.success("Workout session started.");
  }

  async function addExerciseSet(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSession) return;

    const name = exerciseName.trim();
    const setsN = Number(setCount);
    const repsN = Number(repCount);
    const weightN = weight.trim() ? Number(weight.trim()) : null;

    if (!name) return toast.error("Exercise name is required.");
    if (!Number.isFinite(setsN) || setsN <= 0)
      return toast.error("Sets must be a positive number.");
    if (!Number.isFinite(repsN) || repsN <= 0)
      return toast.error("Reps must be a positive number.");
    if (weightN !== null && !Number.isFinite(weightN))
      return toast.error("Weight must be numeric.");

    setSavingSet(true);
    const { data, error } = await supabase
      .from("workout_sets")
      .insert({
        session_id: activeSession.id,
        exercise_name: name,
        sets: setsN,
        reps: repsN,
        weight: weightN,
        unit,
      })
      .select("id, session_id, exercise_name, sets, reps, weight, unit")
      .single();
    setSavingSet(false);

    if (error || !data) {
      toast.error(error?.message ?? "Could not save exercise.");
      return;
    }

    setExerciseName("");
    setSetCount("");
    setRepCount("");
    setWeight("");
    toast.success("Exercise logged.");
    setSessions((prev) =>
      prev.map((session) =>
        session.id === activeSession.id
          ? {
              ...session,
              workout_sets: [...(session.workout_sets ?? []), data as WorkoutSet],
            }
          : session
      )
    );
  }

  async function finishSession() {
    if (!activeSession) return;
    setFinishing(true);
    const finishedAt = new Date().toISOString();
    const { error } = await supabase
      .from("workout_sessions")
      .update({ logged_at: finishedAt })
      .eq("id", activeSession.id)
      .eq("user_id", userId);

    setFinishing(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Session finished.");
    setSessions((prev) =>
      prev.map((session) =>
        session.id === activeSession.id
          ? { ...session, logged_at: finishedAt }
          : session
      )
    );
    setActiveSessionId(null);
  }

  return (
    <div className="dark mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 pb-10 pt-4 sm:max-w-2xl sm:px-6">
      <header>
        <h1 className="font-sans text-2xl font-semibold tracking-tight text-foreground">
          Workout
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Start a session from your split, log exercises, then finish and review
          history.
        </p>
      </header>

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      {splits.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/10 px-4 py-8 text-center">
          <p className="text-sm text-foreground">No workout splits found.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Ask Coach to generate your training split plan first.
          </p>
        </div>
      ) : null}

      {splits.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Your splits</h2>
          <ul className="grid gap-2">
            {splits.map((split) => (
              <li key={split.id}>
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-[48px] w-full justify-between"
                  disabled={!!activeSession || startingSplitId === split.id}
                  onClick={() => void startSession(split)}
                >
                  <span>
                    Day {split.day_number}: {split.name}
                  </span>
                  <Dumbbell className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activeSession ? (
        <section className="space-y-4 rounded-xl border border-border bg-card/80 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Active session</h2>
              <p className="text-xs text-muted-foreground">
                {activeSession.split_id && splitById.get(activeSession.split_id)
                  ? `Day ${splitById.get(activeSession.split_id)!.day_number}: ${
                      splitById.get(activeSession.split_id)!.name
                    }`
                  : "Custom session"}
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={finishing}
              onClick={() => void finishSession()}
            >
              {finishing ? "Finishing…" : "Finish session"}
            </Button>
          </div>

          <form onSubmit={addExerciseSet} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="exercise-name">Exercise name</Label>
              <Input
                id="exercise-name"
                value={exerciseName}
                onChange={(e) => setExerciseName(e.target.value)}
                placeholder="Bench Press"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="set-count">Sets</Label>
                <Input
                  id="set-count"
                  inputMode="numeric"
                  value={setCount}
                  onChange={(e) => setSetCount(e.target.value)}
                  placeholder="3"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rep-count">Reps</Label>
                <Input
                  id="rep-count"
                  inputMode="numeric"
                  value={repCount}
                  onChange={(e) => setRepCount(e.target.value)}
                  placeholder="8"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="weight">Weight</Label>
                <Input
                  id="weight"
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="135"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="unit">Unit</Label>
                <select
                  id="unit"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as "lbs" | "kg")}
                >
                  <option value="lbs">lbs</option>
                  <option value="kg">kg</option>
                </select>
              </div>
            </div>

            <Button type="submit" disabled={savingSet} className="w-full sm:w-auto">
              {savingSet ? "Saving…" : "Add exercise"}
            </Button>
          </form>

          {activeSets.length > 0 ? (
            <ul className="space-y-2">
              {activeSets.map((s) => (
                <li
                  key={s.id}
                  className="rounded-lg border border-border/80 bg-background/60 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-foreground">{s.exercise_name}</span>
                  <p className="text-muted-foreground">
                    {s.sets} sets x {s.reps} reps
                    {s.weight != null ? ` @ ${s.weight} ${s.unit}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No exercises logged yet for this session.
            </p>
          )}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Session history</h2>
        {sessions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            No sessions yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((session) => {
              const isOpen = expandedSessionId === session.id;
              const setRows = session.workout_sets ?? [];
              const when = new Date(session.logged_at).toLocaleString();
              return (
                <li
                  key={session.id}
                  className="rounded-xl border border-border bg-card/80 p-3 shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedSessionId((prev) =>
                        prev === session.id ? null : session.id
                      )
                    }
                    className="flex w-full items-center justify-between text-left"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {session.split_id && splitById.get(session.split_id)
                          ? `Day ${splitById.get(session.split_id)!.day_number}: ${
                              splitById.get(session.split_id)!.name
                            }`
                          : "Custom session"}
                      </p>
                      <p className="text-xs text-muted-foreground">{when}</p>
                    </div>
                    <ChevronDown
                      className={`size-4 text-muted-foreground transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isOpen ? (
                    setRows.length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {setRows.map((s) => (
                          <li
                            key={s.id}
                            className="rounded-lg border border-border/80 bg-background/60 px-3 py-2 text-sm"
                          >
                            <span className="font-medium text-foreground">
                              {s.exercise_name}
                            </span>
                            <p className="text-muted-foreground">
                              {s.sets} sets x {s.reps} reps
                              {s.weight != null ? ` @ ${s.weight} ${s.unit}` : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground">
                        No sets logged for this session.
                      </p>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

