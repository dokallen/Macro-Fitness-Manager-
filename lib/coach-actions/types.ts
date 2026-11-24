import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

import type { Database, Json } from "@/lib/types";

/** A change the Coach proposed. Nothing is written until the user applies it. */
export type ProposalStatus = "pending" | "applying" | "applied" | "cancelled" | "failed";

export type CoachProposal = {
  id: string;
  action: string;
  /** Validated action input, stored as JSON in the conversation. */
  input: Json;
  summary: string;
  status: ProposalStatus;
  decidedAt?: string;
  /** Short message from the executor after a successful apply. */
  result?: string;
  /** Short reason when status is "failed". */
  error?: string;
};

export type CoachActionContext = {
  supabase: SupabaseClient<Database>;
  /** Always the session user's id, never model output or request input. */
  userId: string;
  now: Date;
};

export type CoachActionResult = { message: string };

export type CoachActionDef<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  schema: S;
  summarize: (input: z.infer<S>) => string;
  execute: (ctx: CoachActionContext, input: z.infer<S>) => Promise<CoachActionResult>;
};

/** Thrown by executors for expected, user-facing failures. */
export class CoachActionError extends Error {}
