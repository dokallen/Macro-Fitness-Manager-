/** Calendar-date helpers on "YYYY-MM-DD" strings (no time zone involved). */

export function ymdToUtc(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

export function utcToYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  return utcToYmd(ymdToUtc(ymd) + days * 86_400_000);
}

/** b − a in whole days. */
export function daysBetween(a: string, b: string): number {
  return Math.round((ymdToUtc(b) - ymdToUtc(a)) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(ymd: string): number {
  return new Date(ymdToUtc(ymd)).getUTCDay();
}

/** The date of an instant in a time zone (UTC when none or invalid). */
export function ymdInZone(at: Date, timeZone?: string | null): string {
  let tz = timeZone || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

export function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && utcToYmd(ymdToUtc(s)) === s;
}
