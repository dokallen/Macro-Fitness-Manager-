/**
 * Date helpers for Coach actions. The server has no device clock, so the user's
 * time zone comes from the notification_timezone preference (written by the app
 * from the device). Without it, dates fall back to UTC.
 */

export function userTimeZone(prefs: { key: string; value: string | null }[]): string | null {
  const tz = prefs.find((p) => p.key === "notification_timezone")?.value?.trim();
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

/** "YYYY-MM-DD" for the given instant in the given zone (UTC if none). */
export function localDateString(now: Date, tz: string | null): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Minutes the zone is ahead of UTC at the given instant. */
function offsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/**
 * Noon on a "YYYY-MM-DD" date in the user's zone, as an instant. Matches the
 * app's own forms, which store dated entries at local noon.
 */
export function localNoon(date: string, tz: string | null): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (!tz) return utcNoon;
  return new Date(utcNoon.getTime() - offsetMinutes(utcNoon, tz) * 60000);
}

/** One line for the Coach system prompt so dates in proposals are right. */
export function coachDateContext(now: Date, prefs: { key: string; value: string | null }[]): string {
  const tz = userTimeZone(prefs);
  return `\nToday's date for the user is ${localDateString(now, tz)}${tz ? ` (time zone ${tz})` : " (time zone unknown; dates are in UTC)"}.`;
}
