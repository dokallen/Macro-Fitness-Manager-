/**
 * Parse "4 days per week", "5", etc. Defaults to 4 if no digit found.
 */
export function parseTrainingDaysPerWeek(text: string): number {
  const m = text.trim().match(/(\d+)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 7) return n;
  }
  return 4;
}

/** Monday = 1 … Sunday = 7 */
function mondayFirstDayOfWeek(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

/**
 * Fixed weekly patterns (Mon-first). Distributes rest days across the weekend as n grows.
 */
const TRAINING_DAYS_MF: Record<number, number[]> = {
  1: [1],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
  7: [1, 2, 3, 4, 5, 6, 7],
};

export function isTrainingDay(trainingDaysPerWeek: number, date: Date): boolean {
  const n = Math.min(7, Math.max(1, trainingDaysPerWeek));
  const pattern = TRAINING_DAYS_MF[n] ?? TRAINING_DAYS_MF[4];
  return pattern.includes(mondayFirstDayOfWeek(date));
}
