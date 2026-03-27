"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type MacroRow = { key: string; value: string; unit: string };

type Props = {
  userId: string;
  onAdded: () => void;
};

export function AddRecipeForm({ userId, onAdded }: Props) {
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<string[]>([""]);
  const [macros, setMacros] = useState<MacroRow[]>([
    { key: "", value: "", unit: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);

  function addStep() {
    setSteps((s) => [...s, ""]);
  }

  function updateStep(i: number, v: string) {
    setSteps((s) => s.map((x, j) => (j === i ? v : x)));
  }

  function removeStep(i: number) {
    setSteps((s) => s.filter((_, j) => j !== i));
  }

  function addMacroRow() {
    setMacros((m) => [...m, { key: "", value: "", unit: "" }]);
  }

  function updateMacro(i: number, patch: Partial<MacroRow>) {
    setMacros((rows) =>
      rows.map((r, j) => (j === i ? { ...r, ...patch } : r))
    );
  }

  function removeMacro(i: number) {
    setMacros((rows) => rows.filter((_, j) => j !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      toast.error("Recipe name is required.");
      return;
    }
    const instructions = steps.map((s) => s.trim()).filter(Boolean);
    if (instructions.length === 0) {
      toast.error("Add at least one instruction step.");
      return;
    }

    const macroRows = macros
      .map((row) => ({
        key: row.key.trim(),
        value: row.value.trim(),
        unit: row.unit.trim(),
      }))
      .filter((row) => row.key && row.value);

    for (const row of macroRows) {
      const v = Number(row.value);
      if (!Number.isFinite(v)) {
        toast.error(`Macro “${row.key}” needs a numeric value.`);
        return;
      }
    }

    setSubmitting(true);
    const supabase = createBrowserSupabaseClient();
    const { data: rec, error: recErr } = await supabase
      .from("recipes")
      .insert({
        user_id: userId,
        name: n,
        instructions,
      })
      .select("id")
      .single();

    if (recErr || !rec) {
      toast.error(recErr?.message ?? "Could not save recipe.");
      setSubmitting(false);
      return;
    }

    if (macroRows.length > 0) {
      const { error: mErr } = await supabase.from("recipe_macros").insert(
        macroRows.map((row) => ({
          recipe_id: rec.id,
          key: row.key,
          value: Number(row.value),
          unit: row.unit || "",
        }))
      );
      if (mErr) {
        toast.error(mErr.message);
        setSubmitting(false);
        return;
      }
    }

    toast.success("Recipe saved.");
    setName("");
    setSteps([""]);
    setMacros([{ key: "", value: "", unit: "" }]);
    setSubmitting(false);
    onAdded();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-border bg-card/80 p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-foreground">New recipe</h3>
      <div className="space-y-1.5">
        <Label htmlFor="recipe-name">Name</Label>
        <Input
          id="recipe-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Chicken bowl"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Instructions</Label>
          <Button type="button" variant="ghost" size="sm" onClick={addStep}>
            <Plus className="size-4" />
            Step
          </Button>
        </div>
        <ol className="space-y-2">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 text-xs text-muted-foreground">{i + 1}.</span>
              <Input
                value={step}
                onChange={(e) => updateStep(i, e.target.value)}
                placeholder={`Step ${i + 1}`}
                className="flex-1"
              />
              {steps.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => removeStep(i)}
                  aria-label={`Remove step ${i + 1}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Macros</Label>
          <Button type="button" variant="ghost" size="sm" onClick={addMacroRow}>
            <Plus className="size-4" />
            Row
          </Button>
        </div>
        <div className="space-y-2">
          {macros.map((row, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,80px)_auto]"
            >
              <Input
                placeholder="Key"
                value={row.key}
                onChange={(e) => updateMacro(i, { key: e.target.value })}
              />
              <Input
                placeholder="Value"
                inputMode="decimal"
                value={row.value}
                onChange={(e) => updateMacro(i, { value: e.target.value })}
              />
              <Input
                placeholder="Unit"
                value={row.unit}
                onChange={(e) => updateMacro(i, { unit: e.target.value })}
              />
              {macros.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeMacro(i)}
                  aria-label="Remove macro row"
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : (
                <span className="w-10" />
              )}
            </div>
          ))}
        </div>
      </div>

      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? "Saving…" : "Save recipe"}
      </Button>
    </form>
  );
}
