"use client";

import Link from "next/link";
import { ChevronDown, Dumbbell } from "lucide-react";
import {
  startTransition,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import { toast } from "sonner";

import { SubpageHeader } from "@/components/layout/SubpageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const supabase = createBrowserSupabaseClient();

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

type WorkoutState = {
  userId: string | null;
  isGuest: boolean;
  initialLoading: boolean;
  splits: WorkoutSplit[];
  sessions: WorkoutSession[];
  activeSessionId: string | null;
  expandedSessionId: string | null;
  startingSplitId: string | null;
  savingSet: boolean;
  finishing: boolean;
  exerciseName: string;
  setCount: string;
  repCount: string;
  weight: string;
  unit: "lbs" | "kg";
  pendingConfirmSplit: WorkoutSplit | null;
};

const initialState: WorkoutState = {
  userId: null,
  isGuest: false,
  initialLoading: true,
  splits: [],
  sessions: [],
  activeSessionId: null,
  expandedSessionId: null,
  startingSplitId: null,
  savingSet: false,
  finishing: false,
  exerciseName: "",
  setCount: "",
  repCount: "",
  weight: "",
  unit: "lbs",
  pendingConfirmSplit: null,
};

type WorkoutAction =
  | { type: "init_guest" }
  | { type: "init_auth_error" }
  | { type: "init_no_user" }
  | {
      type: "init_success";
      userId: string;
      splits: WorkoutSplit[];
      sessions: WorkoutSession[];
    }
  | { type: "start_session_begin"; splitId: string }
  | { type: "start_session_fail" }
  | { type: "start_session_success"; session: WorkoutSession }
  | { type: "add_set_begin" }
  | {
      type: "add_set_success";
      sessionId: string;
      set: WorkoutSet;
    }
  | { type: "add_set_fail" }
  | { type: "finish_begin" }
  | { type: "finish_fail" }
  | {
      type: "finish_success";
      sessionId: string;
      finishedAt: string;
    }
  | { type: "set_expanded"; id: string | null }
  | { type: "form_patch"; patch: Partial<Pick<WorkoutState, "exerciseName" | "setCount" | "repCount" | "weight" | "unit">> }
  | { type: "select_split_confirm"; split: WorkoutSplit }
  | { type: "clear_split_confirm" };

function workoutReducer(state: WorkoutState, action: WorkoutAction): WorkoutState {
  switch (action.type) {
    case "init_guest":
      return { ...state, isGuest: true, initialLoading: false };
    case "init_auth_error":
    case "init_no_user":
      return { ...state, initialLoading: false };
    case "init_success":
      return {
        ...state,
        userId: action.userId,
        splits: action.splits,
        sessions: action.sessions,
        initialLoading: false,
      };
    case "start_session_begin":
      return {
        ...state,
        startingSplitId: action.splitId,
        pendingConfirmSplit: null,
      };
    case "start_session_fail":
      return { ...state, startingSplitId: null };
    case "start_session_success":
      return {
        ...state,
        startingSplitId: null,
        sessions: [action.session, ...state.sessions],
        activeSessionId: action.session.id,
        expandedSessionId: action.session.id,
      };
    case "add_set_begin":
      return { ...state, savingSet: true };
    case "add_set_success":
      return {
        ...state,
        savingSet: false,
        exerciseName: "",
        setCount: "",
        repCount: "",
        weight: "",
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId
            ? {
                ...s,
                workout_sets: [...(s.workout_sets ?? []), action.set],
              }
            : s
        ),
      };
    case "add_set_fail":
      return { ...state, savingSet: false };
    case "finish_begin":
      return { ...state, finishing: true };
    case "finish_fail":
      return { ...state, finishing: false };
    case "finish_success":
      return {
        ...state,
        finishing: false,
        activeSessionId: null,
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId
            ? { ...s, logged_at: action.finishedAt }
            : s
        ),
      };
    case "set_expanded":
      return { ...state, expandedSessionId: action.id };
    case "form_patch":
      return { ...state, ...action.patch };
    case "select_split_confirm":
      return { ...state, pendingConfirmSplit: action.split };
    case "clear_split_confirm":
      return { ...state, pendingConfirmSplit: null };
    default:
      return state;
  }
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

export function WorkoutClient() {
  const [state, dispatch] = useReducer(workoutReducer, initialState);

  const activeSession = useMemo(
    () =>
      state.activeSessionId
        ? state.sessions.find((s) => s.id === state.activeSessionId) ?? null
        : null,
    [state.activeSessionId, state.sessions]
  );

  const activeSets = useMemo(
    () => activeSession?.workout_sets ?? [],
    [activeSession]
  );

  const splitById = useMemo(
    () => new Map(state.splits.map((s) => [s.id, s] as const)),
    [state.splits]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      const guest =
        typeof document !== "undefined" &&
        document.cookie
          .split("; ")
          .some((entry) => entry.startsWith("macrofit_guest=1"));
      if (guest) {
        if (!cancelled) {
          startTransition(() => dispatch({ type: "init_guest" }));
        }
        return;
      }

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userErr) {
        console.error(userErr);
        startTransition(() => dispatch({ type: "init_auth_error" }));
        return;
      }

      if (!user) {
        startTransition(() => dispatch({ type: "init_no_user" }));
        return;
      }

      const resolvedUserId = user.id;

      const [splitsRes, sessionsRes] = await Promise.all([
        supabase
          .from("workout_splits")
          .select("id, day_number, name")
          .eq("user_id", resolvedUserId)
          .order("day_number"),
        supabase
          .from("workout_sessions")
          .select(
            "id, split_id, logged_at, notes, workout_sets(id, session_id, exercise_name, sets, reps, weight, unit)"
          )
          .eq("user_id", resolvedUserId)
          .order("logged_at", { ascending: false }),
      ]);

      if (cancelled) return;

      if (splitsRes.error) console.error(splitsRes.error);
      if (sessionsRes.error) console.error(sessionsRes.error);

      const splits = (splitsRes.data ?? []) as WorkoutSplit[];
      const sessions = (sessionsRes.data ?? []) as WorkoutSession[];

      startTransition(() =>
        dispatch({
          type: "init_success",
          userId: resolvedUserId,
          splits,
          sessions,
        })
      );
    }

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, []);

  async function startSession(split: WorkoutSplit) {
    if (!state.userId) return;
    dispatch({ type: "start_session_begin", splitId: split.id });
    const { data, error } = await supabase
      .from("workout_sessions")
      .insert({
        user_id: state.userId,
        split_id: split.id,
        logged_at: new Date().toISOString(),
      })
      .select("id, split_id, logged_at, notes")
      .single();

    if (error || !data) {
      dispatch({ type: "start_session_fail" });
      toast.error(error?.message ?? "Could not start session.");
      return;
    }

    const session: WorkoutSession = {
      ...(data as Omit<WorkoutSession, "workout_sets">),
      workout_sets: [],
    };
    startTransition(() => {
      dispatch({ type: "start_session_success", session });
    });
    toast.success("Workout session started.");
  }

  async function addExerciseSet(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSession) return;

    const name = state.exerciseName.trim();
    const setsN = Number(state.setCount);
    const repsN = Number(state.repCount);
    const weightN = state.weight.trim() ? Number(state.weight.trim()) : null;

    if (!name) return toast.error("Exercise name is required.");
    if (!Number.isFinite(setsN) || setsN <= 0)
      return toast.error("Sets must be a positive number.");
    if (!Number.isFinite(repsN) || repsN <= 0)
      return toast.error("Reps must be a positive number.");
    if (weightN !== null && !Number.isFinite(weightN))
      return toast.error("Weight must be numeric.");

    dispatch({ type: "add_set_begin" });
    const { data, error } = await supabase
      .from("workout_sets")
      .insert({
        session_id: activeSession.id,
        exercise_name: name,
        sets: setsN,
        reps: repsN,
        weight: weightN,
        unit: state.unit,
      })
      .select("id, session_id, exercise_name, sets, reps, weight, unit")
      .single();

    if (error || !data) {
      dispatch({ type: "add_set_fail" });
      toast.error(error?.message ?? "Could not save exercise.");
      return;
    }

    startTransition(() => {
      dispatch({
        type: "add_set_success",
        sessionId: activeSession.id,
        set: data as WorkoutSet,
      });
    });
    toast.success("Exercise logged.");
  }

  async function finishSession() {
    if (!activeSession || !state.userId) return;
    dispatch({ type: "finish_begin" });
    const finishedAt = new Date().toISOString();
    const { error } = await supabase
      .from("workout_sessions")
      .update({ logged_at: finishedAt })
      .eq("id", activeSession.id)
      .eq("user_id", state.userId);

    if (error) {
      dispatch({ type: "finish_fail" });
      toast.error(error.message);
      return;
    }

    startTransition(() => {
      dispatch({
        type: "finish_success",
        sessionId: activeSession.id,
        finishedAt,
      });
    });
    toast.success("Session finished.");
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 bg-[var(--bg)] px-4 pb-10 pt-4 sm:max-w-2xl sm:px-6">
      {state.isGuest ? (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6">
          <p className="max-w-md text-center font-sans text-sm text-muted-foreground">
            Sign in to access workouts and training history.
          </p>
          <ButtonAsLink href="/signup">Create Account</ButtonAsLink>
        </div>
      ) : null}

      {!state.isGuest && state.initialLoading ? (
        <p className="text-sm font-sans text-muted-foreground">Loading…</p>
      ) : null}

      {!state.isGuest && !state.initialLoading && !state.userId ? (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6">
          <p className="max-w-md text-center font-sans text-sm text-muted-foreground">
            Sign in to access workouts and training history.
          </p>
          <ButtonAsLink href="/signup">Create Account</ButtonAsLink>
        </div>
      ) : null}

      {!state.isGuest && !state.initialLoading && state.userId ? (
        <>
          <SubpageHeader
            title="WORKOUT"
            subtitle="Start a session from your split, log exercises, then finish and review history."
          />

          {state.splits.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-warning/40 bg-warning/10 px-4 py-8 text-center">
              <p className="text-sm font-sans text-foreground">No workout splits found.</p>
              <p className="mt-2 text-sm font-sans text-muted-foreground">
                Ask Coach to generate your training split plan first.
              </p>
            </div>
          ) : null}

          {state.splits.length > 0 ? (
            <section className="space-y-3">
              <h2 className="section-label">Your splits</h2>
              {state.pendingConfirmSplit && !activeSession ? (
                <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <p className="text-sm font-sans text-muted-foreground">Start a session for:</p>
                  <p className="font-heading text-lg tracking-[0.08em] text-foreground">
                    Day {state.pendingConfirmSplit.day_number}: {state.pendingConfirmSplit.name}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={!!state.startingSplitId}
                      onClick={() => void startSession(state.pendingConfirmSplit!)}
                    >
                      {state.startingSplitId ? "Starting…" : "Start Session"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!!state.startingSplitId}
                      onClick={() => dispatch({ type: "clear_split_confirm" })}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <ul className="grid gap-2">
                  {state.splits.map((split) => (
                    <li key={split.id}>
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-[48px] w-full justify-between"
                        disabled={!!activeSession || state.startingSplitId === split.id}
                        onClick={() =>
                          dispatch({ type: "select_split_confirm", split })
                        }
                      >
                        <span>
                          Day {split.day_number}: {split.name}
                        </span>
                        <Dumbbell className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {activeSession ? (
            <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="section-label">Active session</h2>
                  <p className="mt-1 text-xs font-sans text-muted-foreground">
                    {activeSession.split_id &&
                    splitById.get(activeSession.split_id)
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
                  disabled={state.finishing}
                  onClick={() => void finishSession()}
                >
                  {state.finishing ? "Finishing…" : "Finish session"}
                </Button>
              </div>

              <form onSubmit={addExerciseSet} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="exercise-name">Exercise name</Label>
                  <Input
                    id="exercise-name"
                    value={state.exerciseName}
                    onChange={(e) =>
                      dispatch({
                        type: "form_patch",
                        patch: { exerciseName: e.target.value },
                      })
                    }
                    placeholder="Bench Press"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label htmlFor="set-count">Sets</Label>
                    <Input
                      id="set-count"
                      inputMode="numeric"
                      value={state.setCount}
                      onChange={(e) =>
                        dispatch({ type: "form_patch", patch: { setCount: e.target.value } })
                      }
                      placeholder="3"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rep-count">Reps</Label>
                    <Input
                      id="rep-count"
                      inputMode="numeric"
                      value={state.repCount}
                      onChange={(e) =>
                        dispatch({ type: "form_patch", patch: { repCount: e.target.value } })
                      }
                      placeholder="8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="weight">Weight</Label>
                    <Input
                      id="weight"
                      inputMode="decimal"
                      value={state.weight}
                      onChange={(e) =>
                        dispatch({ type: "form_patch", patch: { weight: e.target.value } })
                      }
                      placeholder="135"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="unit">Unit</Label>
                    <select
                      id="unit"
                      className="flex h-10 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={state.unit}
                      onChange={(e) =>
                        dispatch({
                          type: "form_patch",
                          patch: { unit: e.target.value as "lbs" | "kg" },
                        })
                      }
                    >
                      <option value="lbs">lbs</option>
                      <option value="kg">kg</option>
                    </select>
                  </div>
                </div>

                <Button type="submit" disabled={state.savingSet} className="w-full sm:w-auto">
                  {state.savingSet ? "Saving…" : "Add exercise"}
                </Button>
              </form>

              {activeSets.length > 0 ? (
                <ul className="space-y-2">
                  {activeSets.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-sans"
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
                <p className="text-xs font-sans text-muted-foreground">
                  No exercises logged yet for this session.
                </p>
              )}
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="section-label">Session history</h2>
            {state.sessions.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border bg-surface-2 px-4 py-6 text-center text-sm font-sans text-muted-foreground">
                No sessions yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {state.sessions.map((session) => {
                  const isOpen = state.expandedSessionId === session.id;
                  const setRows = session.workout_sets ?? [];
                  const when = new Date(session.logged_at).toLocaleString();
                  return (
                    <li
                      key={session.id}
                      className="rounded-2xl border border-border bg-card p-3 shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({
                            type: "set_expanded",
                            id: isOpen ? null : session.id,
                          })
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
                                className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-sans"
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
        </>
      ) : null}
    </div>
  );
}
