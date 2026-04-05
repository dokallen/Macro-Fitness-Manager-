"use client";

import Link from "next/link";
import { ChevronDown, Dumbbell } from "lucide-react";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { SubpageHeader } from "@/components/layout/SubpageHeader";
import { getCoach } from "@/components/coach/CoachChooser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type WebSpeechCtor = new () => {
  lang: string;
  interimResults: boolean;
  onresult:
    | ((ev: { results: ArrayLike<{ 0?: { transcript?: string } }> }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
};

const supabase = createBrowserSupabaseClient();

const LS_1RM = "mf_oneRepMaxes";
const LS_WNOTES = "mf_workoutNotes";
const LS_BW = "mf_bodyWeightLbs";
const LS_COACH = "mf_chosenCoachId";

type OneRmEntry = {
  weight: number;
  reps: number;
  estimated1rm: number;
  date: string;
};

function todayYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readBodyWeightLbs(): number | undefined {
  try {
    const raw = localStorage.getItem(LS_BW);
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

function load1rmMap(): Record<string, OneRmEntry[]> {
  try {
    const raw = localStorage.getItem(LS_1RM);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    return p && typeof p === "object" ? (p as Record<string, OneRmEntry[]>) : {};
  } catch {
    return {};
  }
}

function save1rmForExercise(name: string, entry: OneRmEntry) {
  const map = load1rmMap();
  const list = [...(map[name] ?? [])];
  list.push(entry);
  const next = list.slice(-10);
  map[name] = next;
  localStorage.setItem(LS_1RM, JSON.stringify(map));
}

function loadNotesMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_WNOTES);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    return p && typeof p === "object" ? (p as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function WorkoutBurnVoiceButton({
  busy,
  onBusy,
  onResult,
}: {
  busy: boolean;
  onBusy: (v: boolean) => void;
  onResult: (t: string) => void;
}) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: WebSpeechCtor;
      webkitSpeechRecognition?: WebSpeechCtor;
    };
    setOk(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);
  if (!ok) return null;
  return (
    <button
      type="button"
      className="upload-area w-full"
      disabled={busy}
      onClick={() => {
        const w = window as unknown as {
          SpeechRecognition?: WebSpeechCtor;
          webkitSpeechRecognition?: WebSpeechCtor;
        };
        const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
        if (!Ctor) return;
        onBusy(true);
        const r = new Ctor();
        r.lang = "en-US";
        r.interimResults = false;
        r.onresult = (ev: { results: ArrayLike<{ 0?: { transcript?: string } }> }) => {
          const t = Array.from(ev.results)
            .map((x) => x[0]?.transcript ?? "")
            .join(" ")
            .trim();
          if (!t) return;
          void (async () => {
            try {
              const cw = readBodyWeightLbs();
              const res = await fetch("/api/coach-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  coachTask: "workout_spoken_burn",
                  userText: t,
                  ...(cw != null ? { currentWeightLbs: cw } : {}),
                }),
              });
              const data = (await res.json().catch(() => ({}))) as {
                coachTaskReply?: string;
                error?: string;
              };
              if (!res.ok) {
                toast.error(data.error ?? "Could not estimate burn.");
                return;
              }
              onResult(data.coachTaskReply ?? "");
            } catch {
              toast.error("Request failed.");
            } finally {
              onBusy(false);
            }
          })();
        };
        r.onerror = () => {
          onBusy(false);
          toast.error("Voice not available. Try typing instead.");
        };
        r.onend = () => {};
        try {
          r.start();
        } catch {
          onBusy(false);
        }
      }}
    >
      {busy ? (
        <span className="text-sm">🧠 Coach is calculating your burn…</span>
      ) : (
        <>
          <span className="text-2xl">🎤</span>
          <span className="mt-1 block text-sm font-medium">Dictate workout details</span>
          <span className="mt-0.5 block text-xs text-[var(--text3)]">
            Describe what you did — Coach estimates calories
          </span>
        </>
      )}
    </button>
  );
}

const workoutExampleHintClass = "text-[10px] italic leading-tight text-[var(--text3)]";
const workoutPlaceholderInputClass =
  "placeholder:text-[var(--text3)] placeholder:italic";

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

  const [warmSplit, setWarmSplit] = useState<WorkoutSplit | null>(null);
  const [warmText, setWarmText] = useState("");
  const [warmLoading, setWarmLoading] = useState(false);

  const [notesSplit, setNotesSplit] = useState<WorkoutSplit | null>(null);
  const [notesBody, setNotesBody] = useState("");
  const [notesVoiceBusy, setNotesVoiceBusy] = useState(false);

  const [oneRmExercise, setOneRmExercise] = useState<string | null>(null);
  const [oneRmWeight, setOneRmWeight] = useState("");
  const [oneRmReps, setOneRmReps] = useState("");
  const [oneRmOcrBusy, setOneRmOcrBusy] = useState(false);
  const oneRmImgRef = useRef<HTMLInputElement>(null);

  const [infoExercise, setInfoExercise] = useState<string | null>(null);
  const [infoMoveText, setInfoMoveText] = useState("");
  const [infoFormText, setInfoFormText] = useState("");
  const [infoMoveBusy, setInfoMoveBusy] = useState(false);
  const [infoFormBusy, setInfoFormBusy] = useState(false);

  const [restOpen, setRestOpen] = useState(false);
  const [restDur, setRestDur] = useState(90);
  const [restLeft, setRestLeft] = useState(90);
  const [restRunning, setRestRunning] = useState(false);

  const [burnText, setBurnText] = useState<string | null>(null);
  const [burnBusy, setBurnBusy] = useState(false);
  const burnImgRef = useRef<HTMLInputElement>(null);
  const [burnVoiceBusy, setBurnVoiceBusy] = useState(false);

  const [postOpen, setPostOpen] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postDateLabel, setPostDateLabel] = useState("");
  const [postExSummary, setPostExSummary] = useState<string[]>([]);
  const [postSessionsWeek, setPostSessionsWeek] = useState(0);
  const [postProgramWeek, setPostProgramWeek] = useState(1);
  const [postBurn, setPostBurn] = useState<string | null>(null);
  const [postFeedback, setPostFeedback] = useState("");
  const [postFeedbackBusy, setPostFeedbackBusy] = useState(false);

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

  const fetchWarmup = useCallback(async (split: WorkoutSplit) => {
    setWarmLoading(true);
    setWarmText("");
    try {
      const res = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coachTask: "warmup",
          userText: `Day ${split.day_number}: ${split.name}`,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        coachTaskReply?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Warm-up failed.");
        return;
      }
      setWarmText(data.coachTaskReply ?? "");
    } catch {
      toast.error("Could not load warm-up.");
    } finally {
      setWarmLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!warmSplit) {
      setWarmText("");
      return;
    }
    void fetchWarmup(warmSplit);
  }, [warmSplit, fetchWarmup]);

  useEffect(() => {
    if (!notesSplit) return;
    const map = loadNotesMap();
    setNotesBody(map[todayYmdLocal()] ?? "");
  }, [notesSplit]);

  useEffect(() => {
    if (!restOpen || !restRunning) return;
    const id = window.setInterval(() => {
      setRestLeft((s) => {
        if (s <= 1) {
          setRestRunning(false);
          setRestOpen(false);
          try {
            navigator.vibrate?.([200, 100, 200]);
          } catch {
            /* ignore */
          }
          toast.success("Rest complete — next set!");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [restOpen, restRunning]);

  const epley1rm = useMemo(() => {
    const w = Number(oneRmWeight);
    const r = Number(oneRmReps);
    if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return null;
    return w * (1 + r / 30);
  }, [oneRmWeight, oneRmReps]);

  function openNotesForSplit(split: WorkoutSplit) {
    setNotesSplit(split);
  }

  function saveWorkoutNote() {
    const map = loadNotesMap();
    map[todayYmdLocal()] = notesBody;
    localStorage.setItem(LS_WNOTES, JSON.stringify(map));
    toast.success("Note saved.");
    setNotesSplit(null);
  }

  function clearWorkoutNote() {
    setNotesBody("");
    const map = loadNotesMap();
    delete map[todayYmdLocal()];
    localStorage.setItem(LS_WNOTES, JSON.stringify(map));
    toast.success("Cleared.");
  }

  async function runInfoMove(exercise: string) {
    setInfoMoveBusy(true);
    setInfoMoveText("");
    try {
      const res = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coachTask: "exercise_movement",
          userText: exercise,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        coachTaskReply?: string;
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Request failed.");
        return;
      }
      setInfoMoveText(data.coachTaskReply ?? "");
    } catch {
      toast.error("Could not load description.");
    } finally {
      setInfoMoveBusy(false);
    }
  }

  async function runInfoForm(exercise: string) {
    setInfoFormBusy(true);
    setInfoFormText("");
    try {
      const res = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coachTask: "exercise_form",
          userText: exercise,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        coachTaskReply?: string;
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Request failed.");
        return;
      }
      setInfoFormText(data.coachTaskReply ?? "");
    } catch {
      toast.error("Could not load form tips.");
    } finally {
      setInfoFormBusy(false);
    }
  }

  function readFileDataUrl(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result ?? ""));
      fr.onerror = () => rej(new Error("read"));
      fr.readAsDataURL(file);
    });
  }

  const startNotesVoice = useCallback(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: WebSpeechCtor;
      webkitSpeechRecognition?: WebSpeechCtor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    try {
      setNotesVoiceBusy(true);
      const r = new Ctor();
      r.lang = "en-US";
      r.interimResults = false;
      r.onresult = (ev: { results: ArrayLike<{ 0?: { transcript?: string } }> }) => {
        const t = Array.from(ev.results)
          .map((x) => x[0]?.transcript ?? "")
          .join(" ")
          .trim();
        if (t) setNotesBody((b) => (b.trim() ? `${b.trim()} ${t}` : t));
      };
      r.onerror = () => {
        setNotesVoiceBusy(false);
        toast.error("Voice not available. Try typing instead.");
      };
      r.onend = () => setNotesVoiceBusy(false);
      r.start();
    } catch {
      setNotesVoiceBusy(false);
      toast.error("Voice not available. Try typing instead.");
    }
  }, []);

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
    const setsSnap = [...(activeSession.workout_sets ?? [])];
    const splitLabel =
      activeSession.split_id && splitById.get(activeSession.split_id)
        ? splitById.get(activeSession.split_id)!.name
        : "Workout";

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

    const byEx = new Map<string, { weights: number[]; unit: string }>();
    for (const s of setsSnap) {
      if (s.weight != null) {
        const cur = byEx.get(s.exercise_name) ?? { weights: [], unit: s.unit };
        cur.weights.push(s.weight);
        cur.unit = s.unit;
        byEx.set(s.exercise_name, cur);
      }
    }
    const exSummary = Array.from(byEx.entries()).map(([name, { weights, unit }]) => {
      return `${name}: ${weights.map((w) => `${w}`).join("/")}${unit}`;
    });

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    let sessionsThisWeek = 0;
    for (const s of state.sessions) {
      if (new Date(s.logged_at) >= startOfWeek) sessionsThisWeek++;
    }
    sessionsThisWeek += 1;

    const programWeek =
      state.splits.length > 0
        ? Math.max(
            1,
            Math.ceil(state.sessions.length / Math.max(1, state.splits.length))
          )
        : 1;

    setPostTitle(`🏋️ ${splitLabel}`);
    setPostDateLabel(new Date(finishedAt).toLocaleDateString());
    setPostExSummary(exSummary);
    setPostSessionsWeek(sessionsThisWeek);
    setPostProgramWeek(programWeek);
    setPostBurn(burnText);
    setPostFeedback("");
    setPostFeedbackBusy(true);
    setPostOpen(true);

    let coachId = "";
    try {
      coachId = localStorage.getItem(LS_COACH)?.trim() ?? "";
    } catch {
      /* ignore */
    }
    const userText = [
      `Give post-workout feedback for ${splitLabel}.`,
      `Exercises: ${exSummary.join("; ") || "none logged"}.`,
      `Week ${programWeek} of program.`,
      `${sessionsThisWeek} workouts this week.`,
      `2-3 sentences max. Stay in character.`,
    ].join(" ");

    try {
      const res = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coachTask: "post_workout",
          userText,
          ...(coachId ? { coachId } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        coachTaskReply?: string;
        error?: string;
      };
      if (res.ok) {
        setPostFeedback(data.coachTaskReply ?? "");
      } else {
        setPostFeedback(data.error ?? "Could not load feedback.");
      }
    } catch {
      setPostFeedback("Enjoy your recovery — great effort today.");
    } finally {
      setPostFeedbackBusy(false);
    }
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
                    <li key={split.id} className="flex items-stretch gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-[48px] min-w-0 flex-1 justify-between"
                        disabled={!!activeSession || state.startingSplitId === split.id}
                        onClick={() =>
                          dispatch({ type: "select_split_confirm", split })
                        }
                      >
                        <span>
                          Day {split.day_number}: {split.name}
                        </span>
                        <Dumbbell className="size-4 shrink-0" />
                      </Button>
                      <button
                        type="button"
                        className="shrink-0 rounded-xl border border-border bg-card px-3 text-lg"
                        aria-label="Warm-up"
                        onClick={() => setWarmSplit(split)}
                      >
                        🔥
                      </button>
                      <button
                        type="button"
                        className="shrink-0 rounded-xl border border-border bg-card px-3 text-lg"
                        aria-label="Session notes"
                        onClick={() => openNotesForSplit(split)}
                      >
                        📝
                      </button>
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
                  <p className={workoutExampleHintClass}>Example:</p>
                  <Input
                    id="exercise-name"
                    className={workoutPlaceholderInputClass}
                    value={state.exerciseName}
                    onChange={(e) =>
                      dispatch({
                        type: "form_patch",
                        patch: { exerciseName: e.target.value },
                      })
                    }
                    placeholder="Bench press"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label htmlFor="set-count">Sets</Label>
                    <p className={workoutExampleHintClass}>e.g.</p>
                    <Input
                      id="set-count"
                      className={workoutPlaceholderInputClass}
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
                    <p className={workoutExampleHintClass}>e.g.</p>
                    <Input
                      id="rep-count"
                      className={workoutPlaceholderInputClass}
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
                    <p className={workoutExampleHintClass}>e.g.</p>
                    <Input
                      id="weight"
                      className={workoutPlaceholderInputClass}
                      inputMode="decimal"
                      value={state.weight}
                      onChange={(e) => {
                        const v = e.target.value;
                        dispatch({ type: "form_patch", patch: { weight: v } });
                        if (activeSession && v.trim()) {
                          setRestOpen(true);
                          setRestRunning(true);
                          setRestLeft(restDur);
                        }
                      }}
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
                      className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-sans"
                    >
                      <div>
                        <span className="font-medium text-foreground">{s.exercise_name}</span>
                        <p className="text-muted-foreground">
                          {s.sets} sets x {s.reps} reps
                          {s.weight != null ? ` @ ${s.weight} ${s.unit}` : ""}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                          onClick={() => {
                            setOneRmExercise(s.exercise_name);
                            setOneRmWeight(
                              s.weight != null ? String(s.weight) : ""
                            );
                            setOneRmReps(String(s.reps));
                          }}
                        >
                          1RM
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                          onClick={() => {
                            setInfoExercise(s.exercise_name);
                            setInfoMoveText("");
                            setInfoFormText("");
                          }}
                        >
                          ℹ️
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs font-sans text-muted-foreground">
                  No exercises logged yet for this session.
                </p>
              )}

              <input
                ref={burnImgRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  void (async () => {
                    setBurnBusy(true);
                    try {
                      const dataUrl = await readFileDataUrl(f);
                      const cw = readBodyWeightLbs();
                      const res = await fetch("/api/coach-chat", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          coachTask: "workout_screenshot",
                          imageBase64: dataUrl,
                          ...(cw != null ? { currentWeightLbs: cw } : {}),
                        }),
                      });
                      const data = (await res.json().catch(() => ({}))) as {
                        coachTaskReply?: string;
                        error?: string;
                      };
                      if (!res.ok) {
                        toast.error(data.error ?? "Could not analyze.");
                        return;
                      }
                      setBurnText(data.coachTaskReply ?? "");
                    } catch {
                      toast.error("Upload failed.");
                    } finally {
                      setBurnBusy(false);
                    }
                  })();
                }}
              />
              <input
                ref={oneRmImgRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  void (async () => {
                    setOneRmOcrBusy(true);
                    try {
                      const dataUrl = await readFileDataUrl(f);
                      const res = await fetch("/api/coach-chat", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          coachTask: "one_rm_ocr",
                          imageBase64: dataUrl,
                        }),
                      });
                      const data = (await res.json().catch(() => ({}))) as {
                        coachTaskReply?: string;
                        error?: string;
                      };
                      if (!res.ok) {
                        toast.error(data.error ?? "OCR failed.");
                        return;
                      }
                      const raw = (data.coachTaskReply ?? "").trim();
                      const j = JSON.parse(
                        raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
                      ) as { weight?: number; reps?: number };
                      if (j.weight != null && Number.isFinite(Number(j.weight))) {
                        setOneRmWeight(String(j.weight));
                      }
                      if (j.reps != null && Number.isFinite(Number(j.reps))) {
                        setOneRmReps(String(j.reps));
                      }
                    } catch {
                      toast.error("Could not read photo.");
                    } finally {
                      setOneRmOcrBusy(false);
                    }
                  })();
                }}
              />

              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  className="upload-area w-full"
                  disabled={burnBusy}
                  onClick={() => burnImgRef.current?.click()}
                >
                  {burnBusy ? (
                    <span className="text-sm">🧠 Coach is calculating your burn…</span>
                  ) : (
                    <>
                      <span className="text-2xl">📸</span>
                      <span className="mt-1 block text-sm font-medium">
                        Upload Workout Screenshot
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--text3)]">
                        Calculates calories burned from your stats — ignores app numbers
                      </span>
                    </>
                  )}
                </button>
                <WorkoutBurnVoiceButton
                  busy={burnVoiceBusy}
                  onBusy={setBurnVoiceBusy}
                  onResult={(t) => setBurnText(t)}
                />
              </div>

              {burnText ? (
                <div
                  className="mt-3 rounded-xl border p-3 text-sm text-[var(--text)]"
                  style={{
                    background: "linear-gradient(135deg, #0a1e0a, #0f1520)",
                    borderColor: "#10b98155",
                  }}
                >
                  {burnText}
                </div>
              ) : null}
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

          <div className={`rest-timer-bar${restOpen ? " open" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <span
                className="font-[family-name:var(--fd)] text-xl tabular-nums"
                style={{ color: "var(--accent)" }}
              >
                {Math.floor(restLeft / 60)}:{String(restLeft % 60).padStart(2, "0")}
              </span>
              <div className="flex flex-wrap gap-1">
                {[60, 90, 120].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    className={`rounded-lg px-2 py-1 text-xs text-white ${
                      restDur === sec ? "ring-2 ring-[var(--accent)]" : ""
                    }`}
                    style={{
                      background:
                        restDur === sec ? "var(--accent2)" : "rgba(255,255,255,0.12)",
                    }}
                    onClick={() => {
                      setRestDur(sec);
                      setRestLeft(sec);
                      setRestOpen(true);
                      setRestRunning(true);
                    }}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="text-xs text-[var(--text2)] underline"
                onClick={() => {
                  setRestOpen(false);
                  setRestRunning(false);
                }}
              >
                Skip
              </button>
            </div>
            <div className="prog-bar mt-2">
              <div
                className="prog-fill"
                style={{
                  width:
                    restDur > 0
                      ? `${Math.min(100, ((restDur - restLeft) / restDur) * 100)}%`
                      : "0%",
                }}
              />
            </div>
          </div>

          <button
            type="button"
            className={`sheet-overlay${warmSplit ? " open" : ""}`}
            aria-label="Close warm-up"
            onClick={() => setWarmSplit(null)}
          />
          <div className={`bottom-sheet-base${warmSplit ? " open" : ""}`}>
            <div className="max-h-[75vh] overflow-y-auto p-4 pb-8">
              <div className="mb-3 flex items-start justify-between gap-2">
                <h2 className="font-[family-name:var(--fd)] text-sm uppercase tracking-wide text-[var(--text)]">
                  WARM-UP: {warmSplit?.name ?? ""}
                </h2>
                <button
                  type="button"
                  className="text-sm text-[var(--accent)]"
                  onClick={() => setWarmSplit(null)}
                >
                  Close
                </button>
              </div>
              {warmLoading ? (
                <p className="py-6 text-center text-sm text-[var(--text2)]">
                  🔥 Coach is generating your warm-up...
                </p>
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm text-[var(--text)]">
                  {warmText || "—"}
                </pre>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-[var(--surface2)] px-4 py-2 text-sm text-[var(--text)]"
                  disabled={!warmSplit || warmLoading}
                  onClick={() => warmSplit && void fetchWarmup(warmSplit)}
                >
                  🔄 Regenerate
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-[var(--surface2)] px-4 py-2 text-sm text-[var(--text)]"
                  disabled={!warmText}
                  onClick={() => {
                    void navigator.clipboard.writeText(warmText).then(
                      () => toast.success("Copied."),
                      () => toast.error("Could not copy.")
                    );
                  }}
                >
                  📋 Copy
                </button>
              </div>
              <button
                type="button"
                className="mt-4 w-full rounded-xl py-3 font-semibold text-white"
                style={{ background: "var(--accent2)" }}
                onClick={() => setWarmSplit(null)}
              >
                ▶ Start Workout
              </button>
            </div>
          </div>

          <button
            type="button"
            className={`sheet-overlay${notesSplit ? " open" : ""}`}
            aria-label="Close notes"
            onClick={() => setNotesSplit(null)}
          />
          <div className={`bottom-sheet-base${notesSplit ? " open" : ""}`}>
            <div className="p-4 pb-8">
              <div className="mb-3 flex items-start justify-between gap-2">
                <h2 className="font-[family-name:var(--fd)] text-sm uppercase tracking-wide text-[var(--text)]">
                  SESSION NOTES — Day {notesSplit?.day_number}: {notesSplit?.name}
                </h2>
                <button
                  type="button"
                  className="text-sm text-[var(--accent)]"
                  onClick={() => setNotesSplit(null)}
                >
                  Close
                </button>
              </div>
              <p className="mb-2 text-xs text-[var(--text3)]">
                What&apos;s holding you back today? Energy, sleep, pain, equipment...
              </p>
              <div className="mb-2 flex gap-2">
                <textarea
                  className="inf min-h-[120px] min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-3 text-sm text-[var(--text)]"
                  rows={5}
                  placeholder="Write your session notes here..."
                  value={notesBody}
                  onChange={(e) => setNotesBody(e.target.value)}
                />
                <button
                  type="button"
                  className="shrink-0 self-start rounded-lg border border-[var(--border)] px-3 py-2 text-lg"
                  aria-label="Voice notes"
                  disabled={notesVoiceBusy}
                  onClick={startNotesVoice}
                >
                  🎤
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-xl py-3 font-semibold text-white"
                  style={{ background: "var(--accent)" }}
                  onClick={saveWorkoutNote}
                >
                  Save Note
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl py-3 font-semibold text-[var(--text)]"
                  style={{ background: "var(--surface2)" }}
                  onClick={clearWorkoutNote}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            className={`sheet-overlay${oneRmExercise ? " open" : ""}`}
            aria-label="Close 1RM"
            onClick={() => setOneRmExercise(null)}
          />
          <div className={`bottom-sheet-base${oneRmExercise ? " open" : ""}`}>
            <div className="max-h-[80vh] overflow-y-auto p-4 pb-8">
              <div className="mb-3 flex items-start justify-between gap-2">
                <h2 className="font-[family-name:var(--fd)] text-sm uppercase tracking-wide text-[var(--text)]">
                  1RM: {oneRmExercise}
                </h2>
                <button
                  type="button"
                  className="text-sm text-[var(--accent)]"
                  onClick={() => setOneRmExercise(null)}
                >
                  Close
                </button>
              </div>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-[var(--text3)]">Weight (lbs)</Label>
                  <Input
                    className="mt-1"
                    inputMode="decimal"
                    value={oneRmWeight}
                    onChange={(e) => setOneRmWeight(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-[var(--text3)]">Reps</Label>
                  <Input
                    className="mt-1"
                    inputMode="numeric"
                    value={oneRmReps}
                    onChange={(e) => setOneRmReps(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="button"
                className="mb-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                disabled={oneRmOcrBusy}
                onClick={() => oneRmImgRef.current?.click()}
              >
                {oneRmOcrBusy ? "…" : "📸 Photo"}
              </button>
              <p
                className="mb-3 font-[family-name:var(--fd)] text-2xl"
                style={{ color: "var(--accent)" }}
              >
                {epley1rm != null
                  ? `Est. 1RM: ${epley1rm.toFixed(1)} lbs`
                  : "Est. 1RM: —"}
              </p>
              {epley1rm != null ? (
                <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs">
                  {[0.95, 0.9, 0.85, 0.8, 0.75, 0.7].map((pct) => (
                    <div
                      key={pct}
                      className="rounded-lg bg-[var(--surface2)] px-2 py-2 text-[var(--text)]"
                    >
                      <div className="text-[var(--text3)]">{Math.round(pct * 100)}%</div>
                      <div className="font-mono tabular-nums">
                        {(epley1rm * pct).toFixed(1)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {oneRmExercise ? (
                <div className="mb-3 text-xs text-[var(--text3)]">
                  <p className="mb-1 font-medium text-[var(--text2)]">Previous PRs</p>
                  <ul className="space-y-1">
                    {(load1rmMap()[oneRmExercise] ?? [])
                      .slice(-3)
                      .reverse()
                      .map((e, i) => (
                        <li key={i}>
                          {e.estimated1rm.toFixed(0)} lbs est. ({e.weight}×{e.reps}) —{" "}
                          {e.date}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
              <button
                type="button"
                className="w-full rounded-xl py-3 font-semibold text-white"
                style={{ background: "var(--accent2)" }}
                disabled={epley1rm == null || !oneRmExercise}
                onClick={() => {
                  if (epley1rm == null || !oneRmExercise) return;
                  const w = Number(oneRmWeight);
                  const r = Number(oneRmReps);
                  if (!Number.isFinite(w) || !Number.isFinite(r)) return;
                  save1rmForExercise(oneRmExercise, {
                    weight: w,
                    reps: r,
                    estimated1rm: epley1rm,
                    date: todayYmdLocal(),
                  });
                  toast.success(`1RM saved: ${epley1rm.toFixed(0)} lbs`);
                  setOneRmExercise(null);
                }}
              >
                💾 Save 1RM
              </button>
            </div>
          </div>

          <button
            type="button"
            className={`sheet-overlay${infoExercise ? " open" : ""}`}
            aria-label="Close exercise info"
            onClick={() => setInfoExercise(null)}
          />
          <div className={`bottom-sheet-base${infoExercise ? " open" : ""}`}>
            <div className="max-h-[80vh] overflow-y-auto p-4 pb-8">
              <div className="mb-3 flex items-start justify-between gap-2">
                <h2 className="font-[family-name:var(--fd)] text-sm uppercase tracking-wide text-[var(--text)]">
                  {infoExercise}
                </h2>
                <button
                  type="button"
                  className="text-sm text-[var(--accent)]"
                  onClick={() => setInfoExercise(null)}
                >
                  Close
                </button>
              </div>
              <button
                type="button"
                className="mb-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-3 text-left text-sm text-[var(--text)]"
                onClick={() => {
                  if (!infoExercise) return;
                  const q = encodeURIComponent(`${infoExercise} proper form`);
                  window.open(
                    `https://www.youtube.com/results?search_query=${q}`,
                    "_blank",
                    "noopener,noreferrer"
                  );
                }}
              >
                📹 Watch on YouTube
              </button>
              <button
                type="button"
                className="mb-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-3 text-left text-sm text-[var(--text)]"
                disabled={infoMoveBusy || !infoExercise}
                onClick={() => infoExercise && void runInfoMove(infoExercise)}
              >
                🖼 See the Movement
                {infoMoveBusy ? " — Coach is describing the movement..." : ""}
              </button>
              {infoMoveText ? (
                <pre className="mb-3 whitespace-pre-wrap rounded-lg bg-[var(--bg)] p-2 text-xs text-[var(--text2)]">
                  {infoMoveText}
                </pre>
              ) : null}
              <button
                type="button"
                className="mb-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-3 text-left text-sm text-[var(--text)]"
                disabled={infoFormBusy || !infoExercise}
                onClick={() => infoExercise && void runInfoForm(infoExercise)}
              >
                📋 Form & Technique
                {infoFormBusy ? " — Coach is reviewing form..." : ""}
              </button>
              {infoFormText ? (
                <pre className="whitespace-pre-wrap rounded-lg bg-[var(--bg)] p-2 text-xs text-[var(--text2)]">
                  {infoFormText}
                </pre>
              ) : null}
            </div>
          </div>

          {postOpen ? (
            <div
              className="fixed inset-0 z-[200] flex items-end justify-center bg-[#000d] p-0 sm:items-center sm:p-4"
              role="dialog"
              aria-modal="true"
            >
              <div
                className="max-h-[90vh] w-full max-w-[480px] overflow-y-auto rounded-t-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 sm:rounded-2xl"
              >
                <p className="font-[family-name:var(--fd)] text-xl text-[var(--text)]">
                  {postTitle}
                </p>
                <p className="mt-1 text-sm text-[var(--text2)]">{postDateLabel}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-[var(--surface2)] p-2">
                    <div className="text-[10px] text-[var(--text3)]">Calories</div>
                    <div className="text-sm font-medium text-[var(--text)]">
                      {postBurn ? "✓" : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[var(--surface2)] p-2">
                    <div className="text-[10px] text-[var(--text3)]">This week</div>
                    <div className="text-sm font-medium text-[var(--text)]">
                      {postSessionsWeek}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[var(--surface2)] p-2">
                    <div className="text-[10px] text-[var(--text3)]">Program wk</div>
                    <div className="text-sm font-medium text-[var(--text)]">
                      {postProgramWeek}
                    </div>
                  </div>
                </div>
                {postBurn ? (
                  <p className="mt-3 text-xs text-[var(--text2)]">{postBurn}</p>
                ) : null}
                <div className="mt-4">
                  <p className="text-xs font-medium text-[var(--text3)]">Exercises</p>
                  <ul className="mt-1 space-y-1 text-sm text-[var(--text)]">
                    {postExSummary.length === 0 ? (
                      <li className="text-[var(--text3)]">—</li>
                    ) : (
                      postExSummary.map((line, i) => <li key={i}>{line}</li>)
                    )}
                  </ul>
                </div>
                <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xl">{getCoach().icon}</span>
                    <span className="text-sm font-medium text-[var(--text)]">
                      {getCoach().name}
                    </span>
                  </div>
                  {postFeedbackBusy ? (
                    <p className="text-sm text-[var(--text2)]">Getting feedback...</p>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm text-[var(--text)]">
                      {postFeedback}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="mt-5 w-full rounded-xl py-3 font-semibold text-white"
                  style={{ background: "var(--accent)" }}
                  onClick={() => setPostOpen(false)}
                >
                  CLOSE
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
