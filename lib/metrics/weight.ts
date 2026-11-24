import type { TrackedMetric } from "@/lib/metrics/tracked";

/**
 * One weight metric (Phase 2.5). Metric names are user-defined, so "Weight" or
 * "Body weight" (any case) in either metric list is the weight metric. When the
 * user tracks none, onboarding adds "Weight" (the name its own quick-pick uses)
 * to progress_metric_keys, the list onboarding already writes.
 */
export const DEFAULT_WEIGHT_METRIC_NAME = "Weight";

/** Exact definition of the international avoirdupois pound. */
export const LBS_PER_KG = 1 / 0.45359237;

export function isWeightMetricName(name: string): boolean {
  return /^(body\s*)?weight(\s*\((lbs|kg)\))?$/i.test(name.trim());
}

export function findWeightMetric<T extends Pick<TrackedMetric, "name">>(metrics: readonly T[]): T | undefined {
  return metrics.find((m) => isWeightMetricName(m.name));
}

/** "lbs" or "kg" for the common spellings; null for anything else. */
export function normalizeWeightUnit(unit: string): "lbs" | "kg" | null {
  const u = unit.trim().toLowerCase().replace(/\.$/, "");
  if (["lb", "lbs", "pound", "pounds"].includes(u)) return "lbs";
  if (["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"].includes(u)) return "kg";
  return null;
}

/** Converts between lbs and kg, rounded to 0.1. */
export function convertWeight(value: number, from: "lbs" | "kg", to: "lbs" | "kg"): number {
  if (from === to) return value;
  const v = from === "kg" ? value * LBS_PER_KG : value / LBS_PER_KG;
  return Math.round(v * 10) / 10;
}

/**
 * Where onboarding saves the first weigh-in, so a series never mixes units:
 * - a Body composition weight metric, converted to its unit (lbs/kg), or as
 *   entered when it has no unit; if its unit is something else, it is skipped;
 * - else a progress-list weight metric: one named with the entered unit
 *   ("Weight (lbs)"), or a plain "Weight" (that list has no unit);
 * - else "Weight" added to the progress list, or "Weight (<unit>)" when another
 *   weight metric already exists in a different unit.
 */
export function placeFirstWeighIn(
  progressNames: readonly string[],
  bodyMetrics: readonly Pick<TrackedMetric, "name" | "unit">[],
  entered: { value: number; unit: "lbs" | "kg" }
): { progressNames: string[]; metricName: string; value: number; unit: string } {
  const body = bodyMetrics.find((m) => isWeightMetricName(m.name));
  if (body) {
    if (!body.unit.trim()) return { progressNames: [...progressNames], metricName: body.name, ...entered };
    const target = normalizeWeightUnit(body.unit);
    if (target) {
      return {
        progressNames: [...progressNames],
        metricName: body.name,
        value: convertWeight(entered.value, entered.unit, target),
        unit: body.unit,
      };
    }
  }
  // A progress name may carry its unit ("Weight (lbs)"); reuse it only for that unit.
  const unitOf = (name: string) => /\((lbs|kg)\)\s*$/i.exec(name)?.[1]?.toLowerCase();
  const weightNames = progressNames.filter(isWeightMetricName);
  const fromProgress =
    weightNames.find((n) => unitOf(n) === entered.unit) ??
    weightNames.find((n) => unitOf(n) === undefined);
  if (fromProgress) return { progressNames: [...progressNames], metricName: fromProgress, ...entered };
  const usedName =
    body || weightNames.length
      ? `${DEFAULT_WEIGHT_METRIC_NAME} (${entered.unit})`
      : DEFAULT_WEIGHT_METRIC_NAME;
  return { progressNames: [...progressNames, usedName], metricName: usedName, ...entered };
}
