/**
 * Program week from `user_preferences.program_start` (ISO date string).
 * Shared by server routes and client components (no server-only).
 */
export const USER_PREFERENCE_KEY_PROGRAM_START = "program_start";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export function getProgramWeekNumberFromPreferencesRows(
  rows: { key: string; value: string }[]
): number {
  const raw = rows
    .find((r) => r.key === USER_PREFERENCE_KEY_PROGRAM_START)
    ?.value?.trim();
  if (!raw) return 1;
  const startMs = new Date(raw).getTime();
  if (!Number.isFinite(startMs)) return 1;
  return Math.max(
    Math.floor((Date.now() - startMs) / MS_PER_WEEK) + 1,
    1
  );
}
