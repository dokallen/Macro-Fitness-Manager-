import { z } from "zod";

import { logFood, logProgressEntry } from "@/lib/coach-actions/logging";
import { removeMacroTarget, setMacroTargets } from "@/lib/coach-actions/macro-targets";
import { setPreference } from "@/lib/coach-actions/set-preference";
import { updateProfile } from "@/lib/coach-actions/update-profile";
import type { CoachActionDef } from "@/lib/coach-actions/types";

/** Every change the Coach can propose. Each one runs only after the user taps Apply. */
export const COACH_ACTIONS: Readonly<Record<string, CoachActionDef>> = Object.fromEntries(
  [setMacroTargets, removeMacroTarget, setPreference, logFood, logProgressEntry, updateProfile].map((a) => [a.name, a as unknown as CoachActionDef])
);

export type ClaudeTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

/** Claude tool definitions, generated from each action's zod schema so they cannot drift. */
export function coachTools(
  actions: Readonly<Record<string, CoachActionDef>> = COACH_ACTIONS
): ClaudeTool[] {
  return Object.values(actions).map((a) => {
    const schema = { ...(z.toJSONSchema(a.schema, { io: "input" }) as Record<string, unknown>) };
    delete schema.$schema;
    // "source" is set by the server only; the model never sees it.
    const props = schema.properties as Record<string, unknown> | undefined;
    if (props && "source" in props) {
      schema.properties = Object.fromEntries(Object.entries(props).filter(([k]) => k !== "source"));
    }
    return { name: a.name, description: a.description, input_schema: schema };
  });
}
