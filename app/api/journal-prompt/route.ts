import { NextResponse } from "next/server";

import type { CoachTipContext } from "@/lib/coach-tip";
import { generateJournalPrompt } from "@/lib/journal-prompt";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST() {
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

    const ctx: CoachTipContext = {
      goal: map.goal ?? "",
      recommended_goal_timeframe: map.recommended_goal_timeframe ?? "",
      recommended_workout_frequency: map.recommended_workout_frequency ?? "",
    };

    const prompt = await generateJournalPrompt(ctx);
    return NextResponse.json({ prompt });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to generate journal prompt";
    if (/not configured/i.test(message)) {
      return jsonError(
        "ANTHROPIC_API_KEY is missing or empty. Set a valid key and retry.",
        503
      );
    }
    return jsonError(message, 500);
  }
}
