"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MacroTargetRow } from "@/lib/dashboard/preferences";
import { formatMacroLabel } from "@/lib/dashboard/preferences";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type LabelPrefill = {
  foodName: string;
  quantity: string;
  unit: string;
  macroValues: Record<string, string>;
};

type Props = {
  userId: string;
  macroTargets: MacroTargetRow[];
  onLogged: () => void;
  labelScanSlot?: ReactNode;
  foodNameEndSlot?: ReactNode;
  labelPrefillNonce?: number;
  labelPrefill?: LabelPrefill | null;
  voiceFoodNameNonce?: number;
  voiceFoodName?: string;
};

export function LogMealForm({
  userId,
  macroTargets,
  onLogged,
  labelScanSlot,
  foodNameEndSlot,
  labelPrefillNonce = 0,
  labelPrefill,
  voiceFoodNameNonce = 0,
  voiceFoodName = "",
}: Props) {
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

  useEffect(() => {
    if (!labelPrefill || !labelPrefillNonce) return;
    setFoodName(labelPrefill.foodName);
    setQuantity(labelPrefill.quantity);
    setUnit(labelPrefill.unit);
    setMacroValues((prev) => ({ ...prev, ...labelPrefill.macroValues }));
  }, [labelPrefillNonce, labelPrefill]);

  useEffect(() => {
    if (!voiceFoodNameNonce || !voiceFoodName.trim()) return;
    setFoodName(voiceFoodName.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nonce bumps when voice result arrives
  }, [voiceFoodNameNonce, voiceFoodName]);

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
      className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm"
    >
      <h3 className="section-label">Quick log</h3>
      {labelScanSlot ? <div className="space-y-2">{labelScanSlot}</div> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="food-name">Food name</Label>
          <div className="flex gap-2">
            <Input
              id="food-name"
              className="min-w-0 flex-1"
              value={foodName}
              onChange={(e) => setFoodName(e.target.value)}
              placeholder="e.g. Greek yogurt"
              autoComplete="off"
            />
            {foodNameEndSlot ? (
              <div className="flex shrink-0 items-center">{foodNameEndSlot}</div>
            ) : null}
          </div>
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
            className="flex h-10 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
