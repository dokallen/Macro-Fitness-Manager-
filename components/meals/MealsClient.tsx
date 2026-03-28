"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AddRecipeForm } from "@/components/meals/AddRecipeForm";
import { LogMealForm } from "@/components/meals/LogMealForm";
import {
  MealPlanTab,
  type MealPlanEntryRow,
} from "@/components/meals/MealPlanTab";
import {
  RecipeLibraryTab,
  type RecipeRow,
} from "@/components/meals/RecipeLibraryTab";
import { SubpageHeader } from "@/components/layout/SubpageHeader";
import {
  TodayFoodLogTab,
  type FoodLogRow,
} from "@/components/meals/TodayFoodLogTab";
import type { MacroTargetRow } from "@/lib/dashboard/preferences";
import { getUtcDayBounds } from "@/lib/dashboard/utc-day";
import { getUtcWeekMondayDateString } from "@/lib/meals/week";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type TabId = "today" | "plan" | "library";

type Props = {
  userId: string;
  macroTargets: MacroTargetRow[];
};

export function MealsClient({ userId, macroTargets }: Props) {
  const [tab, setTab] = useState<TabId>("today");
  const [logs, setLogs] = useState<FoodLogRow[]>([]);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [planEntries, setPlanEntries] = useState<MealPlanEntryRow[]>([]);
  const [hasMealPlan, setHasMealPlan] = useState(false);
  const [weekLabel, setWeekLabel] = useState("");
  const [initialLoad, setInitialLoad] = useState(true);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    const { start, end } = getUtcDayBounds();
    const { data, error } = await supabase
      .from("food_logs")
      .select(
        "id, logged_at, meal_number, food_name, quantity, unit, food_log_macros(id, key, value)"
      )
      .eq("user_id", userId)
      .gte("logged_at", start)
      .lte("logged_at", end)
      .order("logged_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }
    setLogs((data ?? []) as FoodLogRow[]);
  }, [userId]);

  const loadRecipes = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase
      .from("recipes")
      .select(
        "id, name, instructions, created_at, recipe_macros(id, key, value, unit)"
      )
      .eq("user_id", userId)
      .order("name");

    if (error) {
      console.error(error);
      return;
    }
    setRecipes((data ?? []) as RecipeRow[]);
  }, [userId]);

  const loadMealPlan = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    const monday = getUtcWeekMondayDateString();
    setWeekLabel(`Week of ${monday} (UTC)`);

    const { data: plan, error: pErr } = await supabase
      .from("meal_plans")
      .select("id, week_start")
      .eq("user_id", userId)
      .eq("week_start", monday)
      .maybeSingle();

    if (pErr) {
      console.error(pErr);
      setHasMealPlan(false);
      setPlanEntries([]);
      return;
    }

    if (!plan) {
      setHasMealPlan(false);
      setPlanEntries([]);
      return;
    }

    setHasMealPlan(true);
    const { data: entries, error: eErr } = await supabase
      .from("meal_plan_entries")
      .select(
        "id, day, meal_number, recipe_id, recipes(id, name, instructions)"
      )
      .eq("meal_plan_id", plan.id)
      .order("day", { ascending: true })
      .order("meal_number", { ascending: true });

    if (eErr) {
      console.error(eErr);
      setPlanEntries([]);
      return;
    }

    setPlanEntries((entries ?? []) as MealPlanEntryRow[]);
  }, [userId]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadLogs(), loadRecipes(), loadMealPlan()]);
    setInitialLoad(false);
  }, [loadLogs, loadRecipes, loadMealPlan]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`meals_food_logs_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "food_logs",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadLogs();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, loadLogs]);

  async function handleDeleteLog(id: string) {
    if (!confirm("Delete this log entry?")) return;
    setDeleteBusyId(id);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase
      .from("food_logs")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    setDeleteBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted.");
    void loadLogs();
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "today", label: "Today’s log" },
    { id: "plan", label: "Meal plan" },
    { id: "library", label: "Recipes" },
  ];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 bg-[var(--bg)] px-4 pb-10 pt-4 sm:max-w-2xl sm:px-6">
      <SubpageHeader title="MEALS" subtitle="Log food, meal plan, and recipes." />

      <div
        className="flex gap-1 rounded-2xl border border-border bg-card p-1"
        role="tablist"
        aria-label="Meals sections"
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

      {initialLoad ? (
        <p className="text-sm text-muted-foreground">Loading your data…</p>
      ) : null}

      {tab === "today" ? (
        <div className="space-y-6" role="tabpanel">
          <TodayFoodLogTab
            logs={logs}
            onDelete={handleDeleteLog}
            busyId={deleteBusyId}
          />
          <LogMealForm
            userId={userId}
            macroTargets={macroTargets}
            onLogged={() => void loadLogs()}
          />
        </div>
      ) : null}

      {tab === "plan" ? (
        <div role="tabpanel">
          <MealPlanTab
            weekLabel={weekLabel}
            entries={planEntries}
            hasPlan={hasMealPlan}
          />
        </div>
      ) : null}

      {tab === "library" ? (
        <div className="space-y-6" role="tabpanel">
          <RecipeLibraryTab recipes={recipes} />
          <AddRecipeForm userId={userId} onAdded={() => void loadRecipes()} />
        </div>
      ) : null}
    </div>
  );
}
