import { NextResponse } from "next/server";

import { generateCoachTip } from "@/lib/coach-tip";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return jsonError(
      "ANTHROPIC_API_KEY is missing. Add it to your server environment and redeploy.",
      503
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    const { data: prefs, error: prefErr } = await supabase
      .from("user_preferences")
      .select("key, value")
      .eq("user_id", user.id);

    if (prefErr) {
      return jsonError(prefErr.message, 500);
    }

    const map = Object.fromEntries(
      (prefs ?? []).map((p) => [p.key, p.value] as const)
    );

    const tip = await generateCoachTip({
      goal: map.goal ?? "",
      recommended_goal_timeframe: map.recommended_goal_timeframe ?? "",
      recommended_workout_frequency: map.recommended_workout_frequency ?? "",
    });

    return NextResponse.json({ tip });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to generate coach tip";
    if (/not configured/i.test(message)) {
      return jsonError(
        "ANTHROPIC_API_KEY is missing or empty. Set a valid key and retry.",
        503
      );
    }
    if (/Claude API error \(401\)|Claude API error \(403\)/i.test(message)) {
      return jsonError(
        "Anthropic rejected the API key (401/403). Verify ANTHROPIC_API_KEY and redeploy.",
        502
      );
    }
    return jsonError(message, 500);
  }
}
