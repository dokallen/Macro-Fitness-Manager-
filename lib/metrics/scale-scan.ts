/**
 * Parsing for the smart-scale screenshot scan (coachTask "detect_body_metrics").
 * Moved unchanged from components/progress/BodyCompositionClient.tsx so the
 * weigh-in card can use the same scan.
 */

function stripJsonFence(raw: string): string {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(s);
  if (fence) s = fence[1].trim();
  return s;
}

export function parseDetectedMetrics(text: string): { name: string; value: string; unit: string }[] {
  const s = stripJsonFence(text);
  try {
    const parsed = JSON.parse(s) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: { name: string; value: string; unit: string }[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const name = String(o.name ?? "").trim();
      if (!name) continue;
      out.push({
        name,
        value: String(o.value ?? "").trim(),
        unit: String(o.unit ?? "").trim(),
      });
    }
    return out;
  } catch {
    return [];
  }
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function matchMetricValue(
  detected: { name: string; value: string }[],
  defName: string
): string {
  const target = norm(defName);
  for (const row of detected) {
    if (norm(row.name) === target) return row.value.replace(/[^\d.-]/g, "") || row.value;
  }
  for (const row of detected) {
    if (norm(row.name).includes(target) || target.includes(norm(row.name))) {
      return row.value.replace(/[^\d.-]/g, "") || row.value;
    }
  }
  return "";
}
