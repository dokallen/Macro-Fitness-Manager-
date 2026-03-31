import { NextResponse } from "next/server";

import { generateSupplementCoachTip } from "@/lib/supplement-coach-tip";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return jsonError(
      "ANTHROPIC_API_KEY is missing. Add it to your server environment and redeploy.",
      503
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const obj =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  const stackSummary =
    obj && typeof obj.stackSummary === "string" ? obj.stackSummary.trim() : "";

  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    const tip = await generateSupplementCoachTip(stackSummary);
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
    return jsonError(message, 500);
  }
}
