import { NextResponse } from "next/server";

import { describeResult } from "@/lib/coaching/calc";
import { loadCheckInData, runCalculation } from "@/lib/coaching/check-in";
import { readOwnTargets } from "@/lib/coaching/own-targets";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Current targets, whether they are the user's own numbers, and what the
 * calculation gives right now (read-only; nothing is proposed or saved).
 */
export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const data = await loadCheckInData(supabase, user.id, new Date(), new URL(req.url).searchParams.get("tz"));
    const result = runCalculation(data, null);
    return NextResponse.json({
      targets: data.targets.map((t) => ({ key: t.key, value: t.displayValue })),
      own: readOwnTargets(data.prefs),
      calculated: {
        decision: result.decision,
        changes: result.changes,
        text: describeResult(result).replace(/Proposed:/, "Calculated:"),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not load targets." }, { status: 500 });
  }
}
