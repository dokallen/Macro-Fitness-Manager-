import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types";

import { getUtcDayBounds } from "./utc-day";

export async function fetchTodayMacroTotals(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Record<string, number>> {
  const { start, end } = getUtcDayBounds();

  const { data: logs, error: logErr } = await supabase
    .from("food_logs")
    .select("id")
    .eq("user_id", userId)
    .gte("logged_at", start)
    .lte("logged_at", end);

  if (logErr) {
    console.error("[fetchTodayMacroTotals] logs", logErr.message);
    return {};
  }

  const ids = (logs ?? []).map((l) => l.id);
  if (ids.length === 0) return {};

  const { data: macros, error: macroErr } = await supabase
    .from("food_log_macros")
    .select("key, value")
    .in("food_log_id", ids);

  if (macroErr) {
    console.error("[fetchTodayMacroTotals] macros", macroErr.message);
    return {};
  }

  const totals: Record<string, number> = {};
  for (const row of macros ?? []) {
    const k = row.key;
    const v = Number(row.value);
    if (!k || !Number.isFinite(v)) continue;
    totals[k] = (totals[k] ?? 0) + v;
  }
  return totals;
}
