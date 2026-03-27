/** Monday start of week in UTC as YYYY-MM-DD (matches meal_plans.week_start date). */
export function getUtcWeekMondayDateString(d = new Date()): string {
  const day = d.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  const mon = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + delta)
  );
  return mon.toISOString().slice(0, 10);
}
