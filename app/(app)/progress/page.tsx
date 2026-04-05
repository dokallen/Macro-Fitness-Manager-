import Link from "next/link";
import { cookies } from "next/headers";

import { BodyCompositionClient } from "@/components/progress/BodyCompositionClient";
import { MetricSetupClient } from "@/components/progress/MetricSetupClient";
import { ProgressClient } from "@/components/progress/ProgressClient";
import { ProgressPhotosClient } from "@/components/progress/ProgressPhotosClient";
import { TrendChartClient } from "@/components/progress/TrendChartClient";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type BodyMetricDef = {
  name: string;
  unit: string;
  better: "higher" | "lower";
};

function parseBodyMetricKeysPref(raw: string | null | undefined): BodyMetricDef[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: BodyMetricDef[] = [];
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
      const unit = String(o.unit ?? "").trim();
      const betterRaw = String(o.better ?? "").toLowerCase();
      const better: "higher" | "lower" =
        betterRaw === "higher" ? "higher" : "lower";
      out.push({ name, unit, better });
    }
    return out;
  } catch {
    return [];
  }
}

function ButtonAsLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 py-2 font-heading text-sm uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90"
    >
      {children}
    </Link>
  );
}

export default async function ProgressPage() {
  const isGuest = cookies().get("macrofit_guest")?.value === "1";
  if (isGuest) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[var(--bg)] p-6">
        <p className="max-w-md text-center font-sans text-sm text-muted-foreground">
          Sign in to log progress and view your trends.
        </p>
        <ButtonAsLink href="/signup">Create Account</ButtonAsLink>
      </div>
    );
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: bodyPref } = await supabase
    .from("user_preferences")
    .select("value")
    .eq("user_id", user.id)
    .eq("key", "body_metric_keys")
    .maybeSingle();

  const bodyMetrics = parseBodyMetricKeysPref(bodyPref?.value ?? null);

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg)]">
      {bodyMetrics.length === 0 ? (
        <MetricSetupClient userId={user.id} />
      ) : (
        <>
          <BodyCompositionClient userId={user.id} initialMetrics={bodyMetrics} />
          <TrendChartClient userId={user.id} metrics={bodyMetrics} />
        </>
      )}
      <ProgressClient userId={user.id} />
      <ProgressPhotosClient />
    </div>
  );
}
