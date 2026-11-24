/**
 * The metrics a user tracks, read on the server.
 *
 * The app has two lists today (see docs/v3-inventory.md):
 * - `body_metric_keys` (Body composition page): JSON [{ name, unit, better }]
 * - `progress_metric_keys` (Progress page and onboarding): JSON ["Weight", ...]
 * Both store entries in progress_entries with metric_key = the metric name.
 * This reads both, without merging how they are stored.
 *
 * The parsing matches parseBodyMetricKeysPref (components/progress/MetricSetupClient.tsx)
 * and parseProgressMetricKeys (components/progress/ProgressClient.tsx). Those live in
 * client components, so they cannot be imported by server code.
 */

export type TrackedMetric = { name: string; unit: string; better?: "higher" | "lower" };

export function parseBodyMetricDefs(raw: string | null | undefined): TrackedMetric[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: TrackedMetric[] = [];
    for (const item of parsed) {
      if (typeof item === "string") {
        const n = item.trim();
        if (n) out.push({ name: n, unit: "", better: "lower" });
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const name = String(o.name ?? "").trim();
      if (!name) continue;
      const better = String(o.better ?? "").toLowerCase() === "higher" ? "higher" : "lower";
      out.push({ name, unit: String(o.unit ?? "").trim(), better });
    }
    return out;
  } catch {
    return [];
  }
}

export function parseProgressMetricNames(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
  } catch {
    return [];
  }
}

/** Every metric from both lists, once each (names compared without case). */
export function trackedMetrics(prefs: readonly { key: string; value: string }[]): TrackedMetric[] {
  const get = (k: string) => prefs.find((p) => p.key === k)?.value ?? null;
  const out: TrackedMetric[] = [];
  const seen = new Set<string>();
  for (const m of parseBodyMetricDefs(get("body_metric_keys"))) {
    if (seen.has(m.name.toLowerCase())) continue;
    seen.add(m.name.toLowerCase());
    out.push(m);
  }
  for (const name of parseProgressMetricNames(get("progress_metric_keys"))) {
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, unit: "" });
  }
  return out;
}

export function findTrackedMetric(
  metrics: readonly TrackedMetric[],
  name: string
): TrackedMetric | undefined {
  const want = name.trim().toLowerCase();
  return metrics.find((m) => m.name.toLowerCase() === want);
}
