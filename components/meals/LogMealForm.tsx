"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MacroTargetRow } from "@/lib/dashboard/preferences";
import { formatMacroLabel } from "@/lib/dashboard/preferences";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Props = {
  userId: string;
  macroTargets: MacroTargetRow[];
  onLogged: () => void;
};

export function LogMealForm({ userId, macroTargets, onLogged }: Props) {
  const [foodName, setFoodName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [mealNumber, setMealNumber] = useState(1);
  const [macroValues, setMacroValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(macroTargets.map((t) => [t.key, ""]))
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMacroValues(Object.fromEntries(macroTargets.map((t) => [t.key, ""])));
  }, [macroTargets]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = foodName.trim();
    if (!name) {
      toast.error("Enter a food name.");
      return;
    }
    const q = quantity.trim() ? Number(quantity) : null;
    if (quantity.trim() && !Number.isFinite(q)) {
      toast.error("Quantity must be a number.");
      return;
    }

    setSubmitting(true);
    const supabase = createBrowserSupabaseClient();
    const { data: log, error: logErr } = await supabase
      .from("food_logs")
      .insert({
        user_id: userId,
        meal_number: mealNumber,
        food_name: name,
        quantity: q,
        unit: unit.trim(),
      })
      .select("id")
      .single();

    if (logErr || !log) {
      toast.error(logErr?.message ?? "Could not save food log.");
      setSubmitting(false);
      return;
    }

    const rows: { food_log_id: string; key: string; value: number }[] = [];
    for (const t of macroTargets) {
      const raw = macroValues[t.key]?.trim() ?? "";
      if (!raw) continue;
      const v = Number(raw);
      if (!Number.isFinite(v)) {
        toast.error(`${formatMacroLabel(t.key)} must be a number.`);
        setSubmitting(false);
        return;
      }
      rows.push({ food_log_id: log.id, key: t.key, value: v });
    }

    if (rows.length > 0) {
      const { error: mErr } = await supabase.from("food_log_macros").insert(rows);
      if (mErr) {
        toast.error(mErr.message);
        setSubmitting(false);
        return;
      }
    }

    toast.success("Meal logged.");
    setFoodName("");
    setQuantity("");
    setUnit("");
    setMealNumber(1);
    setMacroValues(Object.fromEntries(macroTargets.map((t) => [t.key, ""])));
    setSubmitting(false);
    onLogged();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-border bg-card/80 p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-foreground">Quick log</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="food-name">Food name</Label>
          <Input
            id="food-name"
            value={foodName}
            onChange={(e) => setFoodName(e.target.value)}
            placeholder="e.g. Greek yogurt"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qty">Quantity</Label>
          <Input
            id="qty"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="150"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit">Unit</Label>
          <Input
            id="unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="g, ml, pieces…"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="meal-num">Meal (1–4)</Label>
          <select
            id="meal-num"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={mealNumber}
            onChange={(e) => setMealNumber(Number(e.target.value))}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                Meal {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {macroTargets.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Macros (optional)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {macroTargets.map((t) => (
              <div key={t.key} className="space-y-1">
                <Label htmlFor={`m-${t.key}`}>{formatMacroLabel(t.key)}</Label>
                <Input
                  id={`m-${t.key}`}
                  inputMode="decimal"
                  value={macroValues[t.key] ?? ""}
                  onChange={(e) =>
                    setMacroValues((prev) => ({
                      ...prev,
                      [t.key]: e.target.value,
                    }))
                  }
                  placeholder={t.displayValue}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No macro targets in your profile yet. Finish onboarding to log macros by
          target.
        </p>
      )}

      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? "Saving…" : "Log meal"}
      </Button>
    </form>
  );
}
