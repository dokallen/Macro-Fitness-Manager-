/**
 * Every tunable number in the weekly check-in and the target calculation.
 * Listed in docs/phase-2-report.md for Derak to confirm.
 */

/**
 * Trend weight smoothing: each day of gap moves the trend this share of the way
 * toward a new weigh-in (exponential smoothing, applied per day so uneven gaps
 * are handled). 0.1 per day is the classic weight-trend setting.
 */
export const TREND_ALPHA_PER_DAY = 0.1;

/**
 * Energy in a pound of body weight change. 3,500 kcal/lb is a standard
 * approximation, not an exact figure. For kg users it is converted:
 * 3,500 / 0.45359237 ≈ 7,716 kcal per kg.
 */
export const KCAL_PER_LB = 3500;
export const KCAL_PER_KG = KCAL_PER_LB / 0.45359237;

/**
 * Days of food logs and weigh-ins the calculation looks back over (today
 * included). 15 so that "every 2 weeks" weigh-ins (14 days apart) both fit.
 */
export const CALC_WINDOW_DAYS = 15;

/** Hold targets steady unless the data is good enough. */
export const HOLD_MIN_WEIGH_INS = 2;
export const HOLD_MIN_WEIGH_IN_SPAN_DAYS = 7;
export const HOLD_LOGGED_DAYS_WINDOW = 7;
export const HOLD_MIN_LOGGED_DAYS = 5;

/** Check-in timing. */
export const CHECK_IN_EARLY_DAYS = 2;
export const CHECK_IN_LATE_MAX_DAYS = 14;

/** kcal per gram, used to fill calories with carbs and fat. */
export const KCAL_PER_G_PROTEIN = 4;
export const KCAL_PER_G_CARB = 4;
export const KCAL_PER_G_FAT = 9;

/** Calorie targets are rounded to this step. */
export const CALORIE_ROUNDING = 10;

/**
 * Goal pace guidance, in percent of body weight per week. Shown when the user
 * picks a pace; the user chooses, there is no default.
 */
export const GOAL_PACE_GUIDE = {
  loss: [
    { label: "Gentle", min: 0.25, max: 0.5 },
    { label: "Moderate", min: 0.5, max: 0.75 },
    { label: "Aggressive", min: 0.75, max: 1.0 },
  ],
  gain: [
    { label: "Gentle", min: 0.1, max: 0.25 },
    { label: "Moderate", min: 0.25, max: 0.5 },
  ],
} as const;

/** Highest pace the app accepts, in percent of body weight per week. */
export const GOAL_PACE_MAX = { loss: 1.5, gain: 1.0 } as const;

/**
 * Calorie floor, based on the current target: one check-in may lower the
 * calorie target by at most this share of it (0.1 = 10%). If the calculation
 * comes out lower, the floor is proposed instead and the user is told.
 */
export const MAX_CALORIE_DECREASE_FRACTION = 0.1;

/**
 * For a "maintain" goal on the user's own targets: weekly trend change within
 * this percent of body weight counts as holding steady.
 */
export const MAINTAIN_TOLERANCE_PERCENT_PER_WEEK = 0.25;
