"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import type { MacroTargetRow } from "@/lib/dashboard/preferences";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const LS_GOTO = "mf_gotoRecipes";
const LS_PENDING_COOK = "mf_pendingCookMode";

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

export type GotoRecipe = {
  id: string;
  name: string;
  description: string;
  servingSize: string;
  macrosPerServing: { cal: number; pro: number; fat: number; carbs: number };
  ingredients: { amount: string; unit: string; name: string }[];
  steps: string[];
  prepTime: number;
  cookTime: number;
  notes: string;
  timesLogged: number;
  lastLogged: string;
  tags: string[];
};

type TabId = "my" | "add";

function normalizeMacroKey(key: string): string {
  return key.trim().toLowerCase();
}

function stripJsonFence(raw: string): string {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(s);
  if (fence) s = fence[1].trim();
  return s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function loadRecipes(): GotoRecipe[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_GOTO);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p.filter(Boolean) as GotoRecipe[];
  } catch {
    return [];
  }
}

function saveRecipes(list: GotoRecipe[]) {
  try {
    localStorage.setItem(LS_GOTO, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

type CookStep = { text: string; timerSec: number | null };

function parseTimerFromInstruction(text: string): number | null {
  const m = text.match(
    /(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i
  );
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = m[2].toLowerCase();
  if (/hour|hr/.test(u)) return Math.round(n * 3600);
  if (/min/.test(u)) return Math.round(n * 60);
  return Math.round(n);
}

function buildCookSteps(instructions: string[]): CookStep[] {
  return instructions.map((text) => ({
    text,
    timerSec: parseTimerFromInstruction(text),
  }));
}

function CookModeOverlay({
  open,
  steps,
  onExit,
}: {
  open: boolean;
  steps: CookStep[];
  onExit: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [timerLeft, setTimerLeft] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const wakeRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!open) {
      void wakeRef.current?.release().catch(() => {});
      wakeRef.current = null;
      setIdx(0);
      setTimerLeft(0);
      setTimerRunning(false);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.wakeLock?.request) {
      void navigator.wakeLock
        .request("screen")
        .then((w) => {
          wakeRef.current = w;
        })
        .catch(() => {});
    }
    return () => {
      void wakeRef.current?.release().catch(() => {});
      wakeRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !steps.length) return;
    const sec = steps[idx]?.timerSec ?? 0;
    setTimerLeft(sec);
    setTimerRunning(false);
  }, [open, idx, steps]);

  useEffect(() => {
    if (!timerRunning || timerLeft <= 0) return;
    const id = window.setInterval(() => {
      setTimerLeft((s) => {
        if (s <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning, timerLeft]);

  if (!open || !steps.length) return null;

  const step = steps[idx]!;
  const pct = ((idx + 1) / steps.length) * 100;
  const timerTotal = step.timerSec ?? 0;
  const timerPct =
    timerTotal > 0 ? Math.min(100, ((timerTotal - timerLeft) / timerTotal) * 100) : 0;
  const mm = Math.floor(timerLeft / 60);
  const ss = timerLeft % 60;
  const timeLabel = `${mm}:${String(ss).padStart(2, "0")}`;

  return (
    <div className={`cook-overlay-base${open ? " open" : ""}`}>
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <button
          type="button"
          className="text-sm text-[var(--text)]"
          onClick={onExit}
        >
          ✕ Exit
        </button>
        <span className="text-sm text-[var(--text2)]">
          Step {idx + 1} of {steps.length}
        </span>
      </header>
      <div className="px-4 pt-2">
        <div className="prog-bar">
          <div className="prog-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        <p
          className="mb-4 font-[family-name:var(--fd)] text-5xl tabular-nums"
          style={{ color: "var(--accent)" }}
        >
          {idx + 1}
        </p>
        <p className="max-w-md text-lg leading-relaxed text-[var(--text)]">
          {step.text}
        </p>
        {timerTotal > 0 ? (
          <div className="mt-8 w-full max-w-sm">
            <p
              className="mb-2 font-[family-name:var(--fd)] text-3xl tabular-nums"
              style={{ color: "var(--accent3)" }}
            >
              {timeLabel}
            </p>
            <div className="mb-3 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm text-white"
                onClick={() => setTimerRunning((r) => !r)}
              >
                {timerRunning ? "⏸ Pause" : "▶ Start"}
              </button>
              <button
                type="button"
                className="rounded-lg bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)]"
                onClick={() => {
                  setTimerLeft(timerTotal);
                  setTimerRunning(false);
                }}
              >
                ↺ Reset
              </button>
            </div>
            <div className="prog-bar">
              <div className="prog-fill" style={{ width: `${timerPct}%` }} />
            </div>
          </div>
        ) : null}
      </div>
      <footer className="flex shrink-0 gap-3 border-t border-[var(--border)] p-4">
        <button
          type="button"
          className="flex-1 rounded-xl bg-[var(--surface2)] py-3 text-sm font-medium text-[var(--text)]"
          disabled={idx === 0}
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
        >
          ◀ Prev
        </button>
        {idx >= steps.length - 1 ? (
          <button
            type="button"
            className="flex-1 rounded-xl py-3 text-sm font-medium text-white"
            style={{ background: "var(--accent2)" }}
            onClick={onExit}
          >
            ✅ Done
          </button>
        ) : (
          <button
            type="button"
            className="flex-1 rounded-xl py-3 text-sm font-medium text-white"
            style={{ background: "var(--accent)" }}
            onClick={() => setIdx((i) => Math.min(steps.length - 1, i + 1))}
          >
            Next ▶
          </button>
        )}
      </footer>
    </div>
  );
}

function VoiceFieldButton({ onText }: { onText: (t: string) => void }) {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
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
      className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-lg"
      disabled={busy}
      aria-label="Voice input"
      onClick={() => {
        const w = window as unknown as {
          SpeechRecognition?: WebSpeechCtor;
          webkitSpeechRecognition?: WebSpeechCtor;
        };
        const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
        if (!Ctor) return;
        try {
          setBusy(true);
          const r = new Ctor();
          r.lang = "en-US";
          r.interimResults = false;
          r.onresult = (ev: { results: ArrayLike<{ 0?: { transcript?: string } }> }) => {
            const t = Array.from(ev.results)
              .map((x) => x[0]?.transcript ?? "")
              .join(" ")
              .trim();
            if (t) onText(t);
          };
          r.onerror = () => {
            setBusy(false);
            toast.error("Voice not available.");
          };
          r.onend = () => setBusy(false);
          r.start();
        } catch {
          setBusy(false);
        }
      }}
    >
      🎤
    </button>
  );
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function emptyRecipe(): GotoRecipe {
  return {
    id: newId(),
    name: "",
    description: "",
    servingSize: "",
    macrosPerServing: { cal: 0, pro: 0, fat: 0, carbs: 0 },
    ingredients: [{ amount: "", unit: "", name: "" }],
    steps: [""],
    prepTime: 0,
    cookTime: 0,
    notes: "",
    timesLogged: 0,
    lastLogged: "",
    tags: [],
  };
}

type Props = {
  userId: string;
  macroTargets: MacroTargetRow[];
  userGoal: string;
};

export function GoToRecipesClient({ userId, macroTargets, userGoal }: Props) {
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<TabId>("my");
  const [recipes, setRecipes] = useState<GotoRecipe[]>([]);
  const [portionById, setPortionById] = useState<Record<string, number>>({});
  const [cookOpen, setCookOpen] = useState(false);
  const [cookSteps, setCookSteps] = useState<CookStep[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [compareReply, setCompareReply] = useState("");
  const [compareBusy, setCompareBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [buildBusy, setBuildBusy] = useState(false);
  const [calcBusy, setCalcBusy] = useState(false);
  const [descText, setDescText] = useState("");
  const [fitBusy, setFitBusy] = useState(false);
  const [fitVerdict, setFitVerdict] = useState<"fits" | "close" | "no_fit" | null>(
    null
  );
  const [fitSentence, setFitSentence] = useState("");
  const fitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [draft, setDraft] = useState<GotoRecipe>(() => emptyRecipe());

  useEffect(() => {
    setRecipes(loadRecipes());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveRecipes(recipes);
  }, [recipes, hydrated]);

  const macroKeyForAliases = useCallback(
    (aliases: string[]): string | null => {
      for (const a of aliases) {
        const na = normalizeMacroKey(a);
        const hit = macroTargets.find((t) => normalizeMacroKey(t.key) === na);
        if (hit) return hit.key;
      }
      const sub = macroTargets.find((t) => {
        const k = normalizeMacroKey(t.key);
        return aliases.some(
          (a) =>
            k.includes(normalizeMacroKey(a)) || normalizeMacroKey(a).includes(k)
        );
      });
      return sub?.key ?? null;
    },
    [macroTargets]
  );

  const openCook = useCallback(
    (r: GotoRecipe) => {
      const steps = r.steps.map((s) => s.trim()).filter(Boolean);
      if (steps.length === 0) {
        toast.error("Add steps to use cook mode.");
        return;
      }
      try {
        localStorage.setItem(
          LS_PENDING_COOK,
          JSON.stringify({ steps, openedAt: new Date().toISOString() })
        );
      } catch {
        /* ignore */
      }
      setCookSteps(buildCookSteps(steps));
      setCookOpen(true);
    },
    []
  );

  const closeCook = useCallback(() => {
    setCookOpen(false);
    setCookSteps([]);
    try {
      localStorage.removeItem(LS_PENDING_COOK);
    } catch {
      /* ignore */
    }
  }, []);

  const scaledMacros = useCallback((r: GotoRecipe, portions: number) => {
    const m = r.macrosPerServing;
    return {
      cal: m.cal * portions,
      pro: m.pro * portions,
      fat: m.fat * portions,
      carbs: m.carbs * portions,
    };
  }, []);

  const logRecipe = useCallback(
    async (r: GotoRecipe, portions: number) => {
      const supabase = createBrowserSupabaseClient();
      const sm = scaledMacros(r, portions);
      const { data: log, error: logErr } = await supabase
        .from("food_logs")
        .insert({
          user_id: userId,
          meal_number: 1,
          food_name: r.name.trim() || "Go-to recipe",
          quantity: portions,
          unit: r.servingSize.trim() || "servings",
        })
        .select("id")
        .single();
      if (logErr || !log) {
        toast.error(logErr?.message ?? "Log failed.");
        return;
      }
      const pairs: { val: number; aliases: string[] }[] = [
        { val: sm.cal, aliases: ["calories", "calorie", "cal"] },
        { val: sm.pro, aliases: ["protein", "pro"] },
        { val: sm.fat, aliases: ["fat"] },
        { val: sm.carbs, aliases: ["carbs", "carbohydrates"] },
      ];
      const ins: { food_log_id: string; key: string; value: number }[] = [];
      for (const p of pairs) {
        if (!Number.isFinite(p.val)) continue;
        const key = macroKeyForAliases(p.aliases);
        if (!key) continue;
        ins.push({ food_log_id: log.id, key, value: p.val });
      }
      if (ins.length > 0) {
        const { error: mErr } = await supabase.from("food_log_macros").insert(ins);
        if (mErr) {
          toast.error(mErr.message);
          return;
        }
      }
      const iso = new Date().toISOString();
      setRecipes((prev) =>
        prev.map((x) =>
          x.id === r.id
            ? { ...x, timesLogged: x.timesLogged + 1, lastLogged: iso }
            : x
        )
      );
      toast.success(`✅ ${r.name.trim() || "Recipe"} logged`);
    },
    [macroKeyForAliases, scaledMacros, userId]
  );

  const applyDraftToForm = useCallback((r: GotoRecipe) => {
    setDraft({
      ...r,
      ingredients:
        r.ingredients.length > 0 ? r.ingredients : [{ amount: "", unit: "", name: "" }],
      steps: r.steps.length > 0 ? r.steps : [""],
    });
  }, []);

  const openEdit = useCallback(
    (r: GotoRecipe) => {
      setEditId(r.id);
      applyDraftToForm(r);
      setSheetOpen(true);
    },
    [applyDraftToForm]
  );

  const readFileDataUrl = (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result ?? ""));
      fr.onerror = () => rej(new Error("read"));
      fr.readAsDataURL(file);
    });

  const runMacroCalcFromDraft = useCallback(async () => {
    const name = draft.name.trim();
    const ings = draft.ingredients.filter((x) => x.name.trim());
    if (!name || ings.length === 0) {
      toast.error("Add a name and ingredients first.");
      return;
    }
    const servings = Math.max(
      1,
      Number.parseFloat(String(draft.servingSize).replace(/[^\d.]/g, "")) || 1
    );
    setCalcBusy(true);
    try {
      const targets: Record<string, number> = {};
      for (const t of macroTargets) targets[t.key] = t.targetNumber;
      const userText = JSON.stringify({
        recipeName: name,
        servings,
        ingredients: ings,
        userDailyMacroTargets: targets,
      });
      const res = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ coachTask: "recipe_macros", userText }),
      });
      const data = (await res.json()) as { coachTaskReply?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Calculation failed.");
        return;
      }
      const raw = stripJsonFence(data.coachTaskReply ?? "");
      const j = JSON.parse(raw) as {
        macrosPerServing?: { cal: number; pro: number; fat: number; carbs: number };
      };
      const m = j.macrosPerServing;
      if (!m) {
        toast.error("Invalid macro response.");
        return;
      }
      setDraft((d) => ({
        ...d,
        macrosPerServing: {
          cal: Number(m.cal) || 0,
          pro: Number(m.pro) || 0,
          fat: Number(m.fat) || 0,
          carbs: Number(m.carbs) || 0,
        },
      }));
      toast.success("Macros calculated — review and save.");
    } catch {
      toast.error("Could not calculate macros.");
    } finally {
      setCalcBusy(false);
    }
  }, [draft.ingredients, draft.name, draft.servingSize, macroTargets]);

  const runScanRecipe = useCallback(
    async (file: File) => {
      setScanBusy(true);
      try {
        const dataUrl = await readFileDataUrl(file);
        const res = await fetch("/api/coach-chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            coachTask: "scan_recipe",
            imageBase64: dataUrl,
          }),
        });
        const data = (await res.json()) as { coachTaskReply?: string; error?: string };
        if (!res.ok) {
          toast.error(data.error ?? "Scan failed.");
          return;
        }
        const j = JSON.parse(stripJsonFence(data.coachTaskReply ?? "")) as Record<
          string,
          unknown
        >;
        const name = String(j.name ?? "").trim();
        const servings = Math.max(1, Number(j.servings) || 1);
        const ingredients = Array.isArray(j.ingredients)
          ? (j.ingredients as { amount?: string; unit?: string; name?: string }[]).map(
              (x) => ({
                amount: String(x.amount ?? "").trim(),
                unit: String(x.unit ?? "").trim(),
                name: String(x.name ?? "").trim(),
              })
            )
          : [];
        const steps = Array.isArray(j.steps)
          ? (j.steps as unknown[]).map((s) => String(s ?? "").trim()).filter(Boolean)
          : [];
        setDraft((d) => ({
          ...d,
          name: name || d.name,
          servingSize: String(servings),
          ingredients:
            ingredients.length > 0
              ? ingredients
              : [{ amount: "", unit: "", name: "" }],
          steps: steps.length > 0 ? steps : [""],
          prepTime: Number(j.prepTime) || 0,
          cookTime: Number(j.cookTime) || 0,
          notes: String(j.notes ?? "").trim(),
        }));
        toast.success("Recipe extracted — calculating macros…");
        const targets: Record<string, number> = {};
        for (const t of macroTargets) targets[t.key] = t.targetNumber;
        const userText = JSON.stringify({
          recipeName: name || "Scanned recipe",
          servings,
          ingredients: ingredients.filter((i) => i.name),
          userDailyMacroTargets: targets,
        });
        const res2 = await fetch("/api/coach-chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ coachTask: "recipe_macros", userText }),
        });
        const data2 = (await res2.json()) as { coachTaskReply?: string };
        if (res2.ok && data2.coachTaskReply) {
          const raw2 = stripJsonFence(data2.coachTaskReply);
          const j2 = JSON.parse(raw2) as {
            macrosPerServing?: { cal: number; pro: number; fat: number; carbs: number };
          };
          const m = j2.macrosPerServing;
          if (m) {
            setDraft((d) => ({
              ...d,
              macrosPerServing: {
                cal: Number(m.cal) || 0,
                pro: Number(m.pro) || 0,
                fat: Number(m.fat) || 0,
                carbs: Number(m.carbs) || 0,
              },
            }));
          }
        }
      } catch {
        toast.error("Could not read recipe image.");
      } finally {
        setScanBusy(false);
      }
    },
    [macroTargets]
  );

  const runBuildFromDescription = useCallback(async () => {
    const t = descText.trim();
    if (!t) {
      toast.error("Describe your recipe first.");
      return;
    }
    setBuildBusy(true);
    try {
      const res = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          coachTask: "build_recipe_from_description",
          userText: t.slice(0, 8000),
        }),
      });
      const data = (await res.json()) as { coachTaskReply?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Coach could not build recipe.");
        return;
      }
      const j = JSON.parse(stripJsonFence(data.coachTaskReply ?? "")) as Record<
        string,
        unknown
      >;
      const name = String(j.name ?? "").trim();
      const servings = Math.max(1, Number(j.servings) || 1);
      const ingredients = Array.isArray(j.ingredients)
        ? (j.ingredients as { amount?: string; unit?: string; name?: string }[]).map(
            (x) => ({
              amount: String(x.amount ?? "").trim(),
              unit: String(x.unit ?? "").trim(),
              name: String(x.name ?? "").trim(),
            })
          )
        : [];
      const steps = Array.isArray(j.steps)
        ? (j.steps as unknown[]).map((s) => String(s ?? "").trim()).filter(Boolean)
        : [];
      const m = j.macrosPerServing as
        | { cal?: number; pro?: number; fat?: number; carbs?: number }
        | undefined;
      setDraft((d) => ({
        ...d,
        name: name || d.name,
        servingSize: String(servings),
        ingredients:
          ingredients.length > 0
            ? ingredients
            : [{ amount: "", unit: "", name: "" }],
        steps: steps.length > 0 ? steps : [""],
        prepTime: Number(j.prepTime) || 0,
        cookTime: Number(j.cookTime) || 0,
        notes: String(j.notes ?? "").trim(),
        macrosPerServing: {
          cal: Number(m?.cal) || 0,
          pro: Number(m?.pro) || 0,
          fat: Number(m?.fat) || 0,
          carbs: Number(m?.carbs) || 0,
        },
      }));
      toast.success("Recipe built — review and save.");
    } catch {
      toast.error("Could not parse recipe.");
    } finally {
      setBuildBusy(false);
    }
  }, [descText]);

  const runCompare = useCallback(async () => {
    const a = recipes.find((r) => r.id === compareA);
    const b = recipes.find((r) => r.id === compareB);
    if (!a || !b || a.id === b.id) {
      toast.error("Pick two different recipes.");
      return;
    }
    const targets: Record<string, number> = {};
    for (const t of macroTargets) targets[t.key] = t.targetNumber;
    setCompareBusy(true);
    setCompareReply("");
    try {
      const res = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          coachTask: "goto_recipe_compare",
          userText: JSON.stringify({
            recipeA: a,
            recipeB: b,
            macroTargets: targets,
            userGoal,
          }),
        }),
      });
      const data = (await res.json()) as { coachTaskReply?: string; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Compare failed.");
        return;
      }
      setCompareReply((data.coachTaskReply ?? "").trim());
    } catch {
      toast.error("Compare failed.");
    } finally {
      setCompareBusy(false);
    }
  }, [compareA, compareB, macroTargets, recipes, userGoal]);

  useEffect(() => {
    const m = draft.macrosPerServing;
    if (
      macroTargets.length === 0 ||
      !Number.isFinite(m.cal + m.pro + m.fat + m.carbs) ||
      m.cal + m.pro + m.fat + m.carbs <= 0
    ) {
      setFitVerdict(null);
      setFitSentence("");
      return;
    }
    if (fitTimer.current) clearTimeout(fitTimer.current);
    fitTimer.current = setTimeout(() => {
      void (async () => {
        setFitBusy(true);
        try {
          const targets: Record<string, number> = {};
          for (const t of macroTargets) targets[t.key] = t.targetNumber;
          const res = await fetch("/api/coach-chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              coachTask: "goto_recipe_macro_fit",
              userText: JSON.stringify({
                macrosPerServing: m,
                macroTargets: targets,
                userGoal,
                recipeName: draft.name.trim(),
              }),
            }),
          });
          const data = (await res.json()) as { coachTaskReply?: string };
          if (!res.ok) return;
          const j = JSON.parse(stripJsonFence(data.coachTaskReply ?? "")) as {
            verdict?: string;
            sentence?: string;
          };
          const v = j.verdict;
          if (v === "fits" || v === "close" || v === "no_fit") {
            setFitVerdict(v);
            setFitSentence(String(j.sentence ?? "").trim());
          }
        } catch {
          /* ignore */
        } finally {
          setFitBusy(false);
        }
      })();
    }, 500);
    return () => {
      if (fitTimer.current) clearTimeout(fitTimer.current);
    };
  }, [draft.macrosPerServing, draft.name, macroTargets, userGoal]);

  const saveDraftAsRecipe = useCallback(() => {
    const name = draft.name.trim();
    if (!name) {
      toast.error("Recipe name is required.");
      return;
    }
    const m = draft.macrosPerServing;
    if (m.cal + m.pro + m.fat + m.carbs <= 0) {
      toast.error("Enter or calculate macros.");
      return;
    }
    const next: GotoRecipe = {
      ...draft,
      id: editId ?? newId(),
      name,
      description: draft.description.trim(),
      servingSize: draft.servingSize.trim(),
      ingredients: draft.ingredients.filter((i) => i.name.trim() || i.amount.trim()),
      steps: draft.steps.map((s) => s.trim()).filter(Boolean),
      tags: draft.tags,
      timesLogged: editId ? draft.timesLogged : 0,
      lastLogged: editId ? draft.lastLogged : "",
    };
    if (next.ingredients.length === 0) next.ingredients = [{ amount: "", unit: "", name: "" }];
    if (next.steps.length === 0) next.steps = [""];
    setRecipes((prev) => {
      if (editId) return prev.map((r) => (r.id === editId ? next : r));
      if (prev.length >= 12) {
        toast.error("Maximum 12 go-to recipes. Remove one to add more.");
        return prev;
      }
      return [...prev, next];
    });
    if (!editId) {
      setPortionById((p) => ({ ...p, [next.id]: 1 }));
    }
    toast.success(editId ? "Recipe updated." : "Saved to go-tos.");
    setSheetOpen(false);
    setEditId(null);
    setDraft(emptyRecipe());
    setTab("my");
  }, [draft, editId]);

  const tagsInput = useMemo(() => draft.tags.join(", "), [draft.tags]);

  const setTagsFromString = useCallback((s: string) => {
    const tags = s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    setDraft((d) => ({ ...d, tags }));
  }, []);

  const tabs: { id: TabId; label: string }[] = [
    { id: "my", label: "My Go-Tos" },
    { id: "add", label: "Add New" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--bg)] pb-24">
      <header className="ph shrink-0">
        <Link href="/" className="back-btn">
          ← Back
        </Link>
        <h1 className="pt">GO-TO RECIPES</h1>
        <p className="ps">Your reliable rotation</p>
      </header>

      <div
        className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pt-4 sm:max-w-2xl sm:px-6"
        suppressHydrationWarning
      >
        <div
          className="flex gap-1 rounded-2xl border border-border bg-card p-1"
          role="tablist"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={cn(
                "min-h-[44px] flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                tab === t.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "my" ? (
          <section className="space-y-4" role="tabpanel">
            {recipes.length >= 2 ? (
              <button
                type="button"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] py-3 text-sm font-medium text-[var(--text)]"
                onClick={() => {
                  setCompareA(recipes[0]?.id ?? "");
                  setCompareB(recipes[1]?.id ?? "");
                  setCompareReply("");
                  setCompareOpen(true);
                }}
              >
                🧠 Ask Coach to Compare
              </button>
            ) : null}

            {recipes.length === 0 ? (
              <div className="macro-card py-10 text-center">
                <p className="text-4xl" aria-hidden>
                  🍽
                </p>
                <p className="mt-3 text-sm text-[var(--text2)]">
                  No go-to recipes yet. Add your first one below.
                </p>
                <button
                  type="button"
                  className="mt-4 rounded-xl px-6 py-3 font-semibold text-white"
                  style={{ background: "var(--accent2)" }}
                  onClick={() => setTab("add")}
                >
                  Add Recipe
                </button>
              </div>
            ) : (
              <ul className="space-y-4">
                {recipes.map((r) => {
                  const portions = portionById[r.id] ?? 1;
                  const sm = scaledMacros(r, portions);
                  return (
                    <li
                      key={r.id}
                      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
                    >
                      <h2 className="font-[family-name:var(--fd)] text-lg tracking-wide text-[var(--text)]">
                        {r.name}
                      </h2>
                      <p className="mt-1 text-xs text-[var(--text2)]">
                        {Math.round(sm.cal)} cal · {Math.round(sm.pro)}g pro ·{" "}
                        {Math.round(sm.fat)}g fat · {Math.round(sm.carbs)}g carbs{" "}
                        <span className="text-[var(--text3)]">
                          ({portions} serving{portions === 1 ? "" : "s"})
                        </span>
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--text3)]">
                        Logged {r.timesLogged}×
                        {r.lastLogged
                          ? ` · Last ${new Date(r.lastLogged).toLocaleDateString()}`
                          : ""}
                      </p>
                      {r.tags.length > 0 ? (
                        <p className="mt-2 text-[11px] text-[var(--accent)]">
                          {r.tags.join(" · ")}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-[var(--text3)]">Servings</span>
                        <button
                          type="button"
                          className="rounded-lg border border-[var(--border)] px-2 py-1 text-sm"
                          onClick={() =>
                            setPortionById((p) => ({
                              ...p,
                              [r.id]: Math.max(0.25, (p[r.id] ?? 1) - 0.25),
                            }))
                          }
                        >
                          −
                        </button>
                        <span className="min-w-[3rem] text-center text-sm font-medium tabular-nums">
                          {portions}
                        </span>
                        <button
                          type="button"
                          className="rounded-lg border border-[var(--border)] px-2 py-1 text-sm"
                          onClick={() =>
                            setPortionById((p) => ({
                              ...p,
                              [r.id]: Math.min(24, (p[r.id] ?? 1) + 0.25),
                            }))
                          }
                        >
                          +
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-lg bg-[var(--surface2)] px-3 py-2 text-sm"
                          onClick={() => openCook(r)}
                        >
                          🍳 Cook
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-[var(--surface2)] px-3 py-2 text-sm"
                          onClick={() => void logRecipe(r, portions)}
                        >
                          📊 Log
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                          onClick={() => openEdit(r)}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          className="rounded-lg text-[var(--red)] px-3 py-2 text-sm"
                          onClick={() => setDeleteId(r.id)}
                        >
                          🗑 Delete
                        </button>
                      </div>
                      <button
                        type="button"
                        className="mt-3 w-full rounded-xl py-2 text-sm font-medium text-white"
                        style={{ background: "var(--accent)" }}
                        onClick={() => void logRecipe(r, portions)}
                      >
                        Log {portions} serving{portions === 1 ? "" : "s"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : (
          <section className="space-y-6 pb-8" role="tabpanel">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm font-medium text-[var(--text)]">📸 Scan a Recipe</p>
              <input
                ref={scanRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void runScanRecipe(f);
                }}
              />
              <button
                type="button"
                className="upload-area mt-2 w-full text-left"
                disabled={scanBusy}
                onClick={() => scanRef.current?.click()}
              >
                <span className="block text-center text-sm text-[var(--text2)]">
                  {scanBusy ? "Reading…" : "Scan Recipe Card or Screenshot"}
                </span>
              </button>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm font-medium text-[var(--text)]">
                🎤 Describe to Coach
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  className="inf min-w-0 flex-1"
                  placeholder="Describe your recipe... e.g. 2 cups rice, 200g chicken, olive oil..."
                  value={descText}
                  onChange={(e) => setDescText(e.target.value)}
                />
                <VoiceFieldButton onText={(t) => setDescText((x) => (x ? `${x} ${t}` : t))} />
              </div>
              <button
                type="button"
                className="mt-3 w-full rounded-xl py-3 font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--accent2)" }}
                disabled={buildBusy}
                onClick={() => void runBuildFromDescription()}
              >
                Ask Coach to Build
              </button>
            </div>

            <div className="macro-card space-y-3">
              <p className="section-label">✍️ Enter Manually</p>
              <div className="flex gap-2">
                <input
                  className="inf min-w-0 flex-1"
                  placeholder="Recipe name"
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, name: e.target.value }))
                  }
                />
                <VoiceFieldButton
                  onText={(t) =>
                    setDraft((d) => ({ ...d, name: d.name ? `${d.name} ${t}` : t }))
                  }
                />
              </div>
              <input
                className="inf w-full"
                placeholder="Serving size / yield label"
                value={draft.servingSize}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, servingSize: e.target.value }))
                }
              />
              <input
                className="inf w-full"
                placeholder="Short description (optional)"
                value={draft.description}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, description: e.target.value }))
                }
              />
              <p className="text-xs text-[var(--text3)]">Ingredients</p>
              {draft.ingredients.map((row, i) => (
                <div key={i} className="flex flex-wrap gap-2">
                  <input
                    className="inf w-16"
                    placeholder="Amt"
                    value={row.amount}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        ingredients: d.ingredients.map((x, j) =>
                          j === i ? { ...x, amount: e.target.value } : x
                        ),
                      }))
                    }
                  />
                  <input
                    className="inf w-20"
                    placeholder="Unit"
                    value={row.unit}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        ingredients: d.ingredients.map((x, j) =>
                          j === i ? { ...x, unit: e.target.value } : x
                        ),
                      }))
                    }
                  />
                  <input
                    className="inf min-w-0 flex-1"
                    placeholder="Ingredient name"
                    value={row.name}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        ingredients: d.ingredients.map((x, j) =>
                          j === i ? { ...x, name: e.target.value } : x
                        ),
                      }))
                    }
                  />
                </div>
              ))}
              <button
                type="button"
                className="text-sm text-[var(--accent)]"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    ingredients: [...d.ingredients, { amount: "", unit: "", name: "" }],
                  }))
                }
              >
                + Add Ingredient
              </button>
              <p className="text-xs text-[var(--text3)]">Steps</p>
              {draft.steps.map((s, i) => (
                <input
                  key={i}
                  className="inf w-full"
                  placeholder={`Step ${i + 1}`}
                  value={s}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      steps: d.steps.map((x, j) => (j === i ? e.target.value : x)),
                    }))
                  }
                />
              ))}
              <button
                type="button"
                className="text-sm text-[var(--accent)]"
                onClick={() =>
                  setDraft((d) => ({ ...d, steps: [...d.steps, ""] }))
                }
              >
                + Add Step
              </button>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    ["cal", "Cal"],
                    ["pro", "Protein g"],
                    ["fat", "Fat g"],
                    ["carbs", "Carbs g"],
                  ] as const
                ).map(([k, lab]) => (
                  <div key={k}>
                    <label className="text-[10px] text-[var(--text3)]">{lab}</label>
                    <input
                      className="inf w-full"
                      inputMode="decimal"
                      value={
                        k === "cal"
                          ? String(draft.macrosPerServing.cal)
                          : k === "pro"
                            ? String(draft.macrosPerServing.pro)
                            : k === "fat"
                              ? String(draft.macrosPerServing.fat)
                              : String(draft.macrosPerServing.carbs)
                      }
                      onChange={(e) => {
                        const v = Number.parseFloat(e.target.value) || 0;
                        setDraft((d) => ({
                          ...d,
                          macrosPerServing: { ...d.macrosPerServing, [k]: v },
                        }));
                      }}
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] py-2 text-sm font-medium"
                disabled={calcBusy}
                onClick={() => void runMacroCalcFromDraft()}
              >
                🧠 Calculate Macros
              </button>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-[var(--text3)]">Prep (min)</label>
                  <input
                    className="inf w-full"
                    inputMode="numeric"
                    value={draft.prepTime || ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        prepTime: Number.parseInt(e.target.value, 10) || 0,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text3)]">Cook (min)</label>
                  <input
                    className="inf w-full"
                    inputMode="numeric"
                    value={draft.cookTime || ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        cookTime: Number.parseInt(e.target.value, 10) || 0,
                      }))
                    }
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-[var(--text3)]">Tags (comma separated)</label>
                <input
                  className="inf w-full"
                  value={tagsInput}
                  onChange={(e) => setTagsFromString(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <textarea
                  className="inf min-h-[72px] min-w-0 flex-1"
                  placeholder="Notes"
                  value={draft.notes}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, notes: e.target.value }))
                  }
                />
                <VoiceFieldButton
                  onText={(t) =>
                    setDraft((d) => ({
                      ...d,
                      notes: d.notes ? `${d.notes} ${t}` : t,
                    }))
                  }
                />
              </div>

              {fitVerdict ? (
                <div
                  className="rounded-xl border p-3 text-sm"
                  style={{
                    borderColor:
                      fitVerdict === "fits"
                        ? "var(--accent2)"
                        : fitVerdict === "close"
                          ? "var(--yellow)"
                          : "var(--red)",
                    background: "var(--surface2)",
                    color:
                      fitVerdict === "fits"
                        ? "var(--accent2)"
                        : fitVerdict === "close"
                          ? "var(--yellow)"
                          : "var(--red)",
                  }}
                >
                  <p className="font-medium">
                    {fitVerdict === "fits"
                      ? "✅ Fits your plan"
                      : fitVerdict === "close"
                        ? "⚠️ Close — consider adjusting"
                        : "❌ Doesn't fit well"}
                    {fitBusy ? " …" : ""}
                  </p>
                  {fitSentence ? (
                    <p className="mt-1 text-[var(--text2)]">{fitSentence}</p>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                className="w-full rounded-xl py-3 font-semibold text-white"
                style={{ background: "var(--accent2)" }}
                onClick={saveDraftAsRecipe}
              >
                Save Go-To Recipe
              </button>
            </div>
          </section>
        )}
      </div>

      <button
        type="button"
        className={`sheet-overlay${compareOpen ? " open" : ""}`}
        aria-label="Close compare"
        onClick={() => setCompareOpen(false)}
      />
      <div className={`bottom-sheet-base${compareOpen ? " open" : ""}`}>
        <div className="max-h-[85vh] overflow-y-auto p-4 pb-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-[family-name:var(--fd)] text-sm uppercase text-[var(--text)]">
              Compare recipes
            </h2>
            <button
              type="button"
              className="text-sm text-[var(--accent)]"
              onClick={() => setCompareOpen(false)}
            >
              Close
            </button>
          </div>
          <label className="text-xs text-[var(--text3)]">Recipe A</label>
          <select
            className="inf mb-2 w-full"
            value={compareA}
            onChange={(e) => setCompareA(e.target.value)}
          >
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <label className="text-xs text-[var(--text3)]">Recipe B</label>
          <select
            className="inf mb-4 w-full"
            value={compareB}
            onChange={(e) => setCompareB(e.target.value)}
          >
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="w-full rounded-xl py-3 font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--accent)" }}
            disabled={compareBusy}
            onClick={() => void runCompare()}
          >
            {compareBusy ? "Analyzing…" : "Compare with Coach"}
          </button>
          {compareReply ? (
            <div className="macro-card mt-4 whitespace-pre-wrap text-sm text-[var(--text2)]">
              {compareReply}
            </div>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        className={`sheet-overlay${sheetOpen ? " open" : ""}`}
        aria-label="Close editor"
        onClick={() => {
          setSheetOpen(false);
          setEditId(null);
        }}
      />
      <div className={`bottom-sheet-base${sheetOpen ? " open" : ""}`}>
        <div className="max-h-[85vh] overflow-y-auto p-4 pb-10">
          <p className="mb-2 font-[family-name:var(--fd)] text-sm uppercase text-[var(--text)]">
            Edit recipe
          </p>
          <div className="space-y-2">
            <input
              className="inf w-full"
              value={draft.name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
            />
            <input
              className="inf w-full"
              placeholder="Serving size"
              value={draft.servingSize}
              onChange={(e) =>
                setDraft((d) => ({ ...d, servingSize: e.target.value }))
              }
            />
            {draft.steps.map((s, i) => (
              <input
                key={i}
                className="inf w-full"
                value={s}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    steps: d.steps.map((x, j) => (j === i ? e.target.value : x)),
                  }))
                }
              />
            ))}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ["cal", "Cal"],
                  ["pro", "Pro g"],
                  ["fat", "Fat g"],
                  ["carbs", "Carbs g"],
                ] as const
              ).map(([k, lab]) => (
                <input
                  key={k}
                  className="inf w-full"
                  placeholder={lab}
                  inputMode="decimal"
                  value={
                    k === "cal"
                      ? String(draft.macrosPerServing.cal)
                      : k === "pro"
                        ? String(draft.macrosPerServing.pro)
                        : k === "fat"
                          ? String(draft.macrosPerServing.fat)
                          : String(draft.macrosPerServing.carbs)
                  }
                  onChange={(e) => {
                    const v = Number.parseFloat(e.target.value) || 0;
                    setDraft((d) => ({
                      ...d,
                      macrosPerServing: { ...d.macrosPerServing, [k]: v },
                    }));
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              className="w-full rounded-xl py-3 font-semibold text-white"
              style={{ background: "var(--accent2)" }}
              onClick={saveDraftAsRecipe}
            >
              Save changes
            </button>
          </div>
        </div>
      </div>

      {deleteId ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-sm rounded-xl bg-[var(--surface)] p-4 shadow-lg">
            <p className="text-sm text-[var(--text)]">Delete this go-to recipe?</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm"
                onClick={() => setDeleteId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg bg-[var(--red)] py-2 text-sm text-white"
                onClick={() => {
                  setRecipes((prev) => prev.filter((r) => r.id !== deleteId));
                  setDeleteId(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <CookModeOverlay open={cookOpen} steps={cookSteps} onExit={closeCook} />
    </div>
  );
}
