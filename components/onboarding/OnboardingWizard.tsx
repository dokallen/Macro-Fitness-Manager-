"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Bolt,
  Brain,
  Check,
  CheckCircle2,
  Dumbbell,
  Flame,
  Heart,
  Leaf,
  Mars,
  MoveRight,
  PersonStanding,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Venus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  onboardingStep1Schema,
  onboardingStep2Schema,
  onboardingStep3Schema,
} from "@/lib/validations";

type Step1 = { displayName: string; goal: string };
type Step2 = {
  currentWeight: number;
  currentWeightUnit: "lbs" | "kg";
  goalWeight: number;
  goalWeightUnit: "lbs" | "kg";
  age: number;
  height: string;
  biologicalSex: "female" | "male" | "other";
  activityLevel:
    | "sedentary"
    | "lightly active"
    | "moderately active"
    | "very active";
  primaryGoal:
    | "fat loss"
    | "muscle gain"
    | "maintenance"
    | "body recomposition";
  targets: { key: string; value: string; unit?: string }[];
  aiExplanation?: string;
  coachSummary?: string;
  recommendedTimeframe?: string;
  recommendedWorkoutFrequency?: string;
  weeklyPlanSuggestion?: string;
  macroContext?: {
    calories?: string;
    protein?: string;
    carbs?: string;
    fat?: string;
  };
};
type Step3 = { selectedMetrics: string[]; customMetric?: string };

const STEPS = 3;
const QUICK_TRACK_OPTIONS = [
  "Weight",
  "Body fat %",
  "Measurements (waist, chest, arms, etc.)",
  "Energy levels",
  "Strength gains",
  "Sleep quality",
] as const;

const GOAL_OPTIONS = [
  { label: "Strength", icon: Dumbbell, gradient: "from-blue-600 to-slate-700" },
  { label: "Endurance", icon: MoveRight, gradient: "from-sky-500 to-blue-700" },
  { label: "Weight Loss", icon: Flame, gradient: "from-orange-500 to-amber-600" },
  { label: "Clean Eating", icon: Leaf, gradient: "from-emerald-500 to-green-700" },
  { label: "Mobility", icon: PersonStanding, gradient: "from-cyan-600 to-slate-700" },
  { label: "Overall Wellness", icon: Heart, gradient: "from-blue-500 to-slate-600" },
] as const;

const TRACK_ICONS: Record<string, typeof Target> = {
  Weight: Target,
  "Body fat %": Flame,
  "Measurements (waist, chest, arms, etc.)": MoveRight,
  "Energy levels": Bolt,
  "Strength gains": Dumbbell,
  "Sleep quality": Brain,
};
const CORE_TARGET_KEYS = new Set(["calories", "protein", "carbs", "fat"]);
const COACH_CELEBRATION_TEMPLATES = [
  "Coach has your back, {name}. Time to get to work.",
  "Your blueprint is locked in, {name}. Let's build something.",
  "The plan is set. The work starts now, {name}.",
  "Coach sees your potential, {name}. Let's chase it.",
  "{name}, your journey begins today. Coach is with you every step.",
  "No more waiting, {name}. Your transformation starts right now.",
  "Coach has mapped your path to {goal}, {name}. Let's move.",
  "Ready, {name}? Coach is. Let's get after it.",
  "{name}, this is your launch point. Coach is in your corner.",
  "Plan locked. Focus up, {name} - we're building toward {goal}.",
] as const;

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [generatingTargets, setGeneratingTargets] = useState(false);
  const [showTargets, setShowTargets] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState("");
  const safeStep = Number.isFinite(step) ? Math.min(Math.max(step, 1), STEPS) : 1;

  const s1 = useForm<Step1>({
    resolver: zodResolver(onboardingStep1Schema),
    defaultValues: { displayName: "", goal: "" },
  });

  const s2 = useForm<Step2>({
    resolver: zodResolver(onboardingStep2Schema),
    defaultValues: {
      currentWeight: 180,
      currentWeightUnit: "lbs",
      goalWeight: 170,
      goalWeightUnit: "lbs",
      age: 30,
      height: "",
      biologicalSex: "male",
      activityLevel: "moderately active",
      primaryGoal: "fat loss",
      targets: [],
      aiExplanation: "",
      coachSummary: "",
      recommendedTimeframe: "",
      recommendedWorkoutFrequency: "",
      weeklyPlanSuggestion: "",
      macroContext: {
        calories: "",
        protein: "",
        carbs: "",
        fat: "",
      },
    },
  });
  const targetsFA = useFieldArray({ control: s2.control, name: "targets" });

  const s3 = useForm<Step3>({
    resolver: zodResolver(onboardingStep3Schema),
    defaultValues: { selectedMetrics: [], customMetric: "" },
  });
  const metricCount =
    s3.watch("selectedMetrics").length + (s3.watch("customMetric")?.trim() ? 1 : 0);
  const selectedGoals = s1
    .watch("goal")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);

  async function persistAll() {
    setSubmitting(true);
    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("You are not signed in.");
      setSubmitting(false);
      return;
    }

    const v1 = s1.getValues();
    const v2 = s2.getValues();
    const v3 = s3.getValues();

    const { error: userErr } = await supabase
      .from("users")
      .update({
        display_name: v1.displayName.trim(),
        onboarding_complete: true,
      })
      .eq("id", user.id);

    if (userErr) {
      toast.error(userErr.message);
      setSubmitting(false);
      return;
    }

    const prefs: { key: string; value: string }[] = [
      { key: "goal", value: v1.goal.trim() },
      {
        key: "recommended_goal_timeframe",
        value: (v2.recommendedTimeframe ?? "").trim(),
      },
      {
        key: "recommended_workout_frequency",
        value: (v2.recommendedWorkoutFrequency ?? "").trim(),
      },
      {
        key: "weekly_plan_suggestion",
        value: (v2.weeklyPlanSuggestion ?? "").trim(),
      },
    ];

    const progressMetrics = [
      ...v3.selectedMetrics.map((m) => m.trim()).filter(Boolean),
      ...(v3.customMetric?.trim() ? [v3.customMetric.trim()] : []),
    ];
    prefs.push({
      key: "progress_metric_keys",
      value: JSON.stringify(progressMetrics),
    });

    v2.targets.forEach((row) => {
      const k = row.key.trim();
      const v = row.value.trim();
      if (k && v) {
        prefs.push({
          key: k,
          value: row.unit?.trim() ? `${v} ${row.unit.trim()}` : v,
        });
      }
    });

    const normalizedPrefs = prefs
      .map((p) => ({ key: p.key.trim(), value: p.value.trim() }))
      .filter((p) => p.key && p.value);

    const { error: prefErr } = await supabase.from("user_preferences").upsert(
      normalizedPrefs.map((p) => ({
        user_id: user.id,
        key: p.key,
        value: p.value,
        updated_by: "user" as const,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,key" }
    );

    if (prefErr) {
      toast.error(prefErr.message);
      setSubmitting(false);
      return;
    }

    toast.success("Onboarding complete.");
    router.push("/");
    router.refresh();
    setSubmitting(false);
  }

  async function nextFrom(stepFrom: number) {
    if (stepFrom === 2) {
      const ok = await s2.trigger();
      if (!ok) return;
    }
    if (stepFrom === 3) {
      const ok = await s3.trigger();
      if (!ok) return;
      const name = s1.getValues("displayName").trim() || "Athlete";
      const goal = s1.getValues("goal").trim() || "your goal";
      const template =
        COACH_CELEBRATION_TEMPLATES[
          Math.floor(Math.random() * COACH_CELEBRATION_TEMPLATES.length)
        ];
      setCelebrationMessage(
        template.replaceAll("{name}", name).replaceAll("{goal}", goal)
      );
      setShowCelebration(true);
      return;
    }
    setStep((s) => Math.min(STEPS, s + 1));
  }

  async function generateTargetsFromAI() {
    const valid = await s2.trigger([
      "currentWeight",
      "currentWeightUnit",
      "goalWeight",
      "goalWeightUnit",
      "age",
      "height",
      "biologicalSex",
      "activityLevel",
      "primaryGoal",
    ]);
    if (!valid) {
      toast.error("Please complete the required inputs first.");
      return;
    }

    setGeneratingTargets(true);
    setShowTargets(false);
    try {
      const payload = s2.getValues();
      const res = await fetch("/api/macro-targets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentWeight: payload.currentWeight,
          currentWeightUnit: payload.currentWeightUnit,
          goalWeight: payload.goalWeight,
          goalWeightUnit: payload.goalWeightUnit,
          age: payload.age,
          height: payload.height,
          biologicalSex: payload.biologicalSex,
          activityLevel: payload.activityLevel,
          primaryGoal: payload.primaryGoal,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        summary?: string;
        timeframe?: string;
        workoutFrequency?: string;
        weeklyPlan?: string;
        macroContext?: {
          calories?: string;
          protein?: string;
          carbs?: string;
          fat?: string;
        };
        targets?: Array<{ key: string; value: string; unit?: string }>;
      };
      if (!res.ok || data.error) {
        toast.error(data.error ?? "Unable to generate targets.");
        return;
      }
      s2.setValue("aiExplanation", data.summary ?? "", { shouldValidate: false });
      s2.setValue("coachSummary", data.summary ?? "", { shouldValidate: false });
      s2.setValue("recommendedTimeframe", data.timeframe ?? "", {
        shouldValidate: false,
      });
      s2.setValue("recommendedWorkoutFrequency", data.workoutFrequency ?? "", {
        shouldValidate: false,
      });
      s2.setValue("weeklyPlanSuggestion", data.weeklyPlan ?? "", {
        shouldValidate: false,
      });
      s2.setValue("macroContext", data.macroContext ?? {}, { shouldValidate: false });
      s2.setValue("targets", data.targets ?? [], { shouldValidate: true });
      setShowTargets(true);
      toast.success("Coach recommendation generated. You can edit targets before saving.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate targets.");
    } finally {
      setGeneratingTargets(false);
    }
  }

  function back() {
    setStep((s) => Math.max(1, s - 1));
  }

  if (showCelebration) {
    const name = s1.watch("displayName") || "Athlete";
    const goal = s1.watch("goal") || "your goal";

    return (
      <div className="relative mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col items-center justify-center overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-6 py-10 text-center shadow-2xl">
        <div className="pointer-events-none absolute inset-0">
          {Array.from({ length: 18 }).map((_, i) => (
            <span
              key={i}
              className="absolute size-2 rounded-full opacity-80 animate-ping"
              style={{
                left: `${(i * 17) % 100}%`,
                top: `${(i * 29) % 100}%`,
                background: i % 2 === 0 ? "#22d3ee" : "#f472b6",
                animationDelay: `${(i % 6) * 180}ms`,
                animationDuration: "1300ms",
              }}
            />
          ))}
        </div>

        <div className="relative space-y-4">
          <h2 className="bg-gradient-to-r from-sky-300 via-blue-300 to-emerald-300 bg-clip-text text-4xl font-extrabold text-transparent">
            You&apos;re Ready!
          </h2>
          <p className="text-sm text-slate-200">
            {celebrationMessage ||
              `${name}, your AI plan is dialed in for ${goal}. Let&apos;s launch your dashboard and start your journey.`}
          </p>
          <Button
            type="button"
            className="h-12 w-full rounded-xl bg-gradient-to-r from-slate-800 via-blue-700 to-cyan-600 text-base font-semibold text-white shadow-lg hover:opacity-95"
            onClick={persistAll}
            disabled={submitting}
          >
            {submitting ? "Preparing your app…" : "Start My Journey"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setShowCelebration(false)}>
            Back to edit
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col gap-6 bg-slate-800 px-4 py-6 text-slate-100 sm:px-6 sm:py-8">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-300">
            Onboarding
          </p>
          <p className="text-xs text-slate-200">
            Step {safeStep} of {STEPS}
          </p>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-slate-600/70">
          <div
            className="h-full rounded-full bg-gradient-to-r from-slate-700 via-blue-600 to-sky-500 transition-all duration-500"
            style={{ width: `${(safeStep / STEPS) * 100}%` }}
          />
        </div>
        <div className="flex items-center gap-2">
          {Array.from({ length: STEPS }).map((_, i) => {
            const index = i + 1;
            const active = safeStep >= index;
            return (
              <span
                key={index}
                className={`size-2.5 rounded-full transition ${
                  active
                    ? "bg-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.8)]"
                    : "bg-slate-200/70"
                }`}
              />
            );
          })}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-slate-300/25 bg-slate-700/80 p-5 shadow-2xl backdrop-blur-sm sm:p-6">
        <div
          key={safeStep}
          className="animate-in fade-in-0 slide-in-from-right-4 space-y-5 duration-300"
        >
        {safeStep === 1 ? (
          <form
            className="space-y-5"
            onSubmit={s1.handleSubmit(() => {
              setStep((s) => Math.min(STEPS, s + 1));
            })}
          >
            <div className="relative overflow-hidden rounded-xl border border-sky-300/35 bg-gradient-to-br from-slate-700/80 via-blue-800/50 to-sky-800/40 p-5">
              <div className="pointer-events-none absolute inset-0">
                {[Dumbbell, Flame, Heart, Bolt].map((Icon, i) => (
                  <Icon
                    key={i}
                    className="absolute size-5 animate-bounce text-sky-200/80"
                    style={{
                      top: `${15 + i * 18}%`,
                      right: `${8 + i * 11}%`,
                      animationDelay: `${i * 140}ms`,
                    }}
                  />
                ))}
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white">
                Let&apos;s Build Your Plan
              </h1>
              <p className="mt-2 text-sm text-slate-100">
                Your AI Coach will personalize everything around your goal.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">What should we call you?</Label>
              <Input id="displayName" className="border-slate-300/40 bg-slate-700/85 text-white" {...s1.register("displayName")} />
              {s1.formState.errors.displayName?.message ? (
                <p className="text-sm text-destructive">
                  {s1.formState.errors.displayName.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Your Goals</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {GOAL_OPTIONS.map((goal) => {
                  const selected = selectedGoals.includes(goal.label);
                  const Icon = goal.icon;
                  return (
                    <button
                      key={goal.label}
                      type="button"
                      onClick={() => {
                        const next = selected
                          ? selectedGoals.filter((g) => g !== goal.label)
                          : [...selectedGoals, goal.label];
                        s1.setValue("goal", next.join(", "), { shouldValidate: true });
                      }}
                      className={`rounded-xl border p-3 text-left transition ${
                        selected
                          ? `border-transparent bg-gradient-to-r ${goal.gradient} text-white shadow-lg`
                          : "border-2 border-slate-300/60 bg-slate-600/85 text-white hover:border-sky-300/90"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded-lg p-2 ${
                            selected ? "bg-white/20" : "bg-slate-500/70"
                          }`}
                        >
                          <Icon className="size-4 animate-bounce text-white" />
                        </span>
                        <span className="font-medium text-white">{goal.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {s1.formState.errors.goal?.message ? (
                <p className="text-sm text-destructive">
                  {s1.formState.errors.goal.message}
                </p>
              ) : null}
            </div>
            <StepNav showBack={false} nextLabel="Next" nextButtonType="submit" />
          </form>
        ) : null}

        {safeStep === 2 ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-xl border border-blue-400/30 bg-gradient-to-r from-sky-500/15 to-slate-700/40 p-4">
              <div className={`rounded-full bg-slate-900 p-3 ${generatingTargets ? "animate-pulse" : ""}`}>
                <Sparkles className="size-6 text-sky-300" />
              </div>
              <div>
                  <p className="text-xs uppercase tracking-wider text-sky-300">AI Coach</p>
                <p className="text-sm text-slate-100">
                  Tell me about yourself and I&apos;ll build your plan.
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-100">
              Answer a few quick questions. AI will estimate your calorie and
              macro targets, then you can fine-tune anything.
            </p>
            <div className="grid gap-4 rounded-2xl border border-slate-300/25 bg-slate-700/75 p-4 shadow-sm sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Current weight</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step="0.1"
                    className="border-slate-300/50 bg-slate-600/90 text-white placeholder:text-slate-200"
                    {...s2.register("currentWeight", { valueAsNumber: true })}
                  />
                  <select
                    className="h-10 rounded-md border border-slate-300/50 bg-slate-600/90 px-3 text-sm text-white"
                    {...s2.register("currentWeightUnit")}
                  >
                    <option value="lbs">lbs</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Goal weight</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step="0.1"
                    className="border-slate-300/50 bg-slate-600/90 text-white placeholder:text-slate-200"
                    {...s2.register("goalWeight", { valueAsNumber: true })}
                  />
                  <select
                    className="h-10 rounded-md border border-slate-300/50 bg-slate-600/90 px-3 text-sm text-white"
                    {...s2.register("goalWeightUnit")}
                  >
                    <option value="lbs">lbs</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Age</Label>
                <Input
                  type="number"
                  className="border-slate-300/50 bg-slate-600/90 text-white placeholder:text-slate-200"
                  {...s2.register("age", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label>Height</Label>
                <Input
                  className="border-slate-300/50 bg-slate-600/90 text-white placeholder:text-slate-200"
                  placeholder='e.g. 5"11 or 180 cm'
                  {...s2.register("height")}
                />
              </div>
              <div className="space-y-2">
                <Label>Biological sex</Label>
                <div className="flex gap-2">
                  {([
                    { value: "female", label: "Female", icon: Venus },
                    { value: "male", label: "Male", icon: Mars },
                    { value: "other", label: "Other", icon: PersonStanding },
                  ] as const).map((sex) => {
                    const selected = s2.watch("biologicalSex") === sex.value;
                    const Icon = sex.icon;
                    return (
                      <button
                        key={sex.value}
                        type="button"
                        onClick={() =>
                          s2.setValue("biologicalSex", sex.value, {
                            shouldValidate: true,
                          })
                        }
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
                          selected
                            ? "border-sky-300 bg-sky-500/25 text-white shadow-[0_0_10px_rgba(56,189,248,0.45)]"
                            : "border-slate-200/60 bg-slate-600/85 text-white hover:border-sky-300/90"
                        }`}
                      >
                        <Icon className="size-4" />
                        {sex.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Activity level</Label>
                <div className="grid grid-cols-1 gap-2">
                  {([
                    {
                      value: "sedentary",
                      label: "Sedentary",
                      description: "Mostly sitting, little structured activity",
                      icon: Brain,
                    },
                    {
                      value: "lightly active",
                      label: "Lightly Active",
                      description: "Light movement and occasional workouts",
                      icon: MoveRight,
                    },
                    {
                      value: "moderately active",
                      label: "Moderately Active",
                      description: "Regular training most days of the week",
                      icon: Dumbbell,
                    },
                    {
                      value: "very active",
                      label: "Very Active",
                      description: "High daily activity and intense training",
                      icon: Bolt,
                    },
                  ] as const).map((activity) => {
                    const selected = s2.watch("activityLevel") === activity.value;
                    const Icon = activity.icon;
                    return (
                      <button
                        key={activity.value}
                        type="button"
                        onClick={() =>
                          s2.setValue("activityLevel", activity.value, {
                            shouldValidate: true,
                          })
                        }
                        className={`rounded-xl border p-3 text-left transition ${
                          selected
                            ? "border-sky-300 bg-sky-500/25 shadow-[0_0_10px_rgba(56,189,248,0.45)]"
                            : "border-slate-200/60 bg-slate-600/85 hover:border-sky-300/90"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`rounded-md p-1.5 ${
                              selected ? "bg-sky-400/35" : "bg-slate-500/70"
                            }`}
                          >
                            <Icon className="size-4 text-white" />
                          </div>
                          <div>
                            <p className="font-semibold text-white">{activity.label}</p>
                            <p className="text-xs text-slate-100">
                              {activity.description}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Primary goal</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([
                    {
                      value: "fat loss",
                      label: "Fat Loss",
                      description: "Reduce body fat while preserving muscle",
                      icon: Flame,
                    },
                    {
                      value: "muscle gain",
                      label: "Muscle Gain",
                      description: "Build strength and increase muscle mass",
                      icon: Dumbbell,
                    },
                    {
                      value: "maintenance",
                      label: "Maintenance",
                      description: "Keep your current weight and composition",
                      icon: Target,
                    },
                    {
                      value: "body recomposition",
                      label: "Body Recomposition",
                      description: "Lose fat and gain muscle simultaneously",
                      icon: Sparkles,
                    },
                  ] as const).map((goal) => {
                    const selected = s2.watch("primaryGoal") === goal.value;
                    const Icon = goal.icon;
                    return (
                      <button
                        key={goal.value}
                        type="button"
                        onClick={() =>
                          s2.setValue("primaryGoal", goal.value, {
                            shouldValidate: true,
                          })
                        }
                        className={`rounded-xl border p-3 text-left transition ${
                          selected
                            ? "border-orange-300 bg-orange-500/20 shadow-[0_0_10px_rgba(251,146,60,0.45)]"
                            : "border-slate-200/60 bg-slate-600/85 hover:border-orange-300/90"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`rounded-md p-1.5 ${
                              selected ? "bg-orange-400/35" : "bg-slate-500/70"
                            }`}
                          >
                            <Icon className="size-4 text-white" />
                          </div>
                          <div>
                            <p className="font-semibold text-white">{goal.label}</p>
                            <p className="text-xs text-slate-100">
                              {goal.description}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <Button
              type="button"
              className="h-12 w-full rounded-xl bg-gradient-to-r from-slate-800 via-blue-700 to-sky-600 text-base font-semibold text-white shadow-lg hover:opacity-95"
              onClick={generateTargetsFromAI}
              disabled={generatingTargets}
            >
              {generatingTargets ? (
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="size-4 animate-spin" />
                  Analyzing your profile...
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="size-4" />
                  Ask Coach for a Plan
                </span>
              )}
            </Button>

            {s2.watch("coachSummary") ? (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
                  <Sparkles className="size-4" />
                  Coach Recommendation
                </div>
                <div className="space-y-3 text-sm">
                  <p className="text-foreground">{s2.watch("coachSummary")}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-border bg-card p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Recommended Timeframe
                      </p>
                      <p className="mt-1 font-medium text-foreground">
                        {s2.watch("recommendedTimeframe")}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Workout Frequency
                      </p>
                      <p className="mt-1 font-medium text-foreground">
                        {s2.watch("recommendedWorkoutFrequency")}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Weekly Plan Structure
                    </p>
                    <p className="mt-1 text-foreground">
                      {s2.watch("weeklyPlanSuggestion")}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div
              className={`space-y-3 rounded-2xl border border-slate-200/45 bg-slate-600/90 p-4 text-white shadow-sm transition-all duration-500 ${
                showTargets
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-2 opacity-0"
              }`}
            >
              <Label className="text-white">Recommended targets (editable)</Label>
              {targetsFA.fields.map((field, index) => (
                <div key={field.id} className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    className="border-slate-300/60 bg-slate-700/90 text-white placeholder:text-slate-200"
                    placeholder="Key"
                    {...s2.register(`targets.${index}.key`)}
                  />
                  <Input
                    className="border-slate-300/60 bg-slate-700/90 text-white placeholder:text-slate-200"
                    placeholder="Value"
                    {...s2.register(`targets.${index}.value`)}
                  />
                  <Input
                    className="border-slate-300/60 bg-slate-700/90 text-white placeholder:text-slate-200"
                    placeholder="Unit"
                    {...s2.register(`targets.${index}.unit`)}
                  />
                  {!CORE_TARGET_KEYS.has(
                    (s2.watch(`targets.${index}.key`) ?? "").trim().toLowerCase()
                  ) ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 border border-rose-400/30 bg-transparent text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                      onClick={() => targetsFA.remove(index)}
                      aria-label="Remove row"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
              <div className="space-y-2 rounded-lg border border-slate-300/50 bg-slate-700/85 p-3 text-sm">
                <p className="font-medium text-white">Why these macro targets</p>
                {(["calories", "protein", "carbs", "fat"] as const).map((key) => {
                  const contextText = s2.watch(`macroContext.${key}`);
                  const target = s2
                    .watch("targets")
                    .find((t) => t.key.trim().toLowerCase() === key.toLowerCase());
                  const numeric = Number.parseFloat(
                    (target?.value ?? "").replace(/[^\d.]/g, "")
                  );
                  const max =
                    key === "calories" ? 3500 : key === "protein" ? 260 : key === "carbs" ? 420 : 130;
                  const pct = Number.isFinite(numeric) ? Math.min(100, (numeric / max) * 100) : 0;
                  if (!contextText) return null;
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium capitalize text-white">{key}</span>
                        <span className="text-white">{target?.value ?? "-"}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full transition-all duration-500 ${
                            key === "calories"
                              ? "bg-gradient-to-r from-rose-500 to-orange-400"
                              : key === "protein"
                                ? "bg-gradient-to-r from-cyan-500 to-sky-400"
                                : key === "carbs"
                                  ? "bg-gradient-to-r from-violet-500 to-fuchsia-400"
                                  : "bg-gradient-to-r from-emerald-500 to-lime-400"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-slate-100">{contextText}</p>
                    </div>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => targetsFA.append({ key: "", value: "", unit: "" })}
              >
                <Plus className="mr-2 size-4" />
                Add target row
              </Button>
            </div>
            {s2.formState.errors.targets?.message ? (
              <p className="text-sm text-destructive">
                {String(s2.formState.errors.targets?.message)}
              </p>
            ) : null}
            <StepNav
              showBack
              onBack={back}
              onNext={() => nextFrom(2)}
              nextLabel="Next"
            />
          </div>
        ) : null}

        {safeStep === 3 ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Track My Progress
              </p>
              <h2 className="text-xl font-semibold tracking-tight">
                What do you want to track?
              </h2>
              <p className="text-sm text-slate-100">
                Help us build your progress dashboard. We&apos;ll track these metrics over time
                so you can see how far you&apos;ve come. You can always add or remove these
                later inside the app.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {QUICK_TRACK_OPTIONS.map((option, i) => {
                const selected = s3.watch("selectedMetrics").includes(option);
                const Icon = TRACK_ICONS[option] ?? Target;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      const current = s3.getValues("selectedMetrics");
                      const next = selected
                        ? current.filter((m) => m !== option)
                        : [...current, option];
                      s3.setValue("selectedMetrics", next, { shouldValidate: true });
                    }}
                    className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition ${
                      selected
                        ? "animate-[pulse_0.45s_ease-in-out] border-emerald-400 bg-emerald-500/15 shadow-lg"
                        : "border-2 border-slate-300/60 bg-slate-600/85 text-white hover:border-sky-300/90"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2 text-sm font-medium">
                      <Icon
                        className={`size-4 ${selected ? "text-emerald-300" : "text-white"} animate-bounce`}
                        style={{ animationDelay: `${i * 80}ms` }}
                      />
                      {option}
                    </span>
                    {selected ? (
                      <CheckCircle2 className="size-5 animate-bounce text-emerald-300" />
                    ) : (
                      <Check className="size-5 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              <Label htmlFor="customMetric">Anything else?</Label>
              <Input
                id="customMetric"
                className="border-slate-300/40 bg-slate-700/85 text-white"
                placeholder="Optional: add one more thing to track"
                {...s3.register("customMetric")}
              />
            </div>

            {s3.formState.errors.selectedMetrics?.message ? (
              <p className="text-sm text-destructive">
                {String(s3.formState.errors.selectedMetrics.message)}
              </p>
            ) : null}
            {s3.formState.errors.customMetric?.message ? (
              <p className="text-sm text-destructive">
                {String(s3.formState.errors.customMetric.message)}
              </p>
            ) : null}

            <div className="rounded-xl border border-slate-300/25 bg-slate-700/75 p-4">
              <p className="mb-3 text-sm font-semibold">Dashboard preview</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Habits", value: Math.min(95, 20 + metricCount * 12), color: "#22d3ee" },
                  { label: "Recovery", value: Math.min(90, 25 + metricCount * 10), color: "#a78bfa" },
                  { label: "Performance", value: Math.min(92, 18 + metricCount * 13), color: "#f472b6" },
                ].map((ring) => (
                  <div key={ring.label} className="text-center">
                    <div
                      className="mx-auto grid size-16 place-items-center rounded-full text-xs font-semibold"
                      style={{
                        background: `conic-gradient(${ring.color} ${ring.value}%, rgba(255,255,255,0.12) ${ring.value}% 100%)`,
                      }}
                    >
                      <span className="grid size-11 place-items-center rounded-full bg-slate-950">
                        {ring.value}%
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-200">{ring.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <StepNav
              showBack
              onBack={back}
              onNext={() => nextFrom(3)}
              nextLabel="Finish"
              nextDisabled={submitting}
            />
          </div>
        ) : null}
      </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <SignOutButton />
      </div>
    </div>
  );
}

function StepNav({
  showBack,
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  nextButtonType = "button",
}: {
  showBack: boolean;
  onBack?: () => void;
  /** Omitted when `nextButtonType` is `"submit"` (form `onSubmit` handles navigation). */
  onNext?: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  nextButtonType?: "button" | "submit";
}) {
  return (
    <div className="flex flex-wrap gap-3 pt-2">
      {showBack ? (
        <Button
          type="button"
          variant="ghost"
          className="border border-slate-300/30 bg-transparent text-slate-300 hover:bg-slate-500/10 hover:text-slate-100"
          onClick={onBack}
        >
          Back
        </Button>
      ) : null}
      <Button
        type={nextButtonType}
        className="min-w-[120px]"
        onClick={nextButtonType === "submit" ? undefined : onNext}
        disabled={nextDisabled}
      >
        {nextLabel}
      </Button>
    </div>
  );
}
