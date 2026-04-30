"use client";

const ROTATION_DAY_OPTIONS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

type Props = {
  showRotationCard: boolean;
  rotationDay: string;
  onRotationDayChange: (day: string) => void;
  onDismissFlag: () => void;
  onGenerateForMe: () => void;
  onLetMeBuild: () => void;
  onUsePastWeek: () => void;
};

export function MealPlanRotationClient({
  showRotationCard,
  rotationDay,
  onRotationDayChange,
  onDismissFlag,
  onGenerateForMe,
  onLetMeBuild,
  onUsePastWeek,
}: Props) {
  return (
    <div className="space-y-4">
      {showRotationCard ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-4">
          <h2 className="font-[family-name:var(--fd)] text-sm uppercase tracking-wide text-[var(--text)]">
            Time to rotate your meal plan!
          </h2>
          <p className="mt-1 text-xs text-[var(--text3)]">
            Pick how you want the next week to come together. Generation runs in
            Coach chat when you are ready.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              className="cbtn green"
              onClick={onGenerateForMe}
            >
              Generate for me
            </button>
            <button
              type="button"
              className="cbtn yes"
              onClick={onLetMeBuild}
            >
              Let me build it
            </button>
            <button
              type="button"
              className="cbtn no"
              onClick={onUsePastWeek}
            >
              Use a past week
            </button>
            <button
              type="button"
              className="cbtn no"
              onClick={onDismissFlag}
            >
              Dismiss reminder
            </button>
          </div>
        </section>
      ) : null}

      <div className="space-y-1">
        <label className="text-xs text-[var(--text3)]" htmlFor="meal-rotation-day">
          Meal plan rotation day (UTC, matches nightly job)
        </label>
        <select
          id="meal-rotation-day"
          className="inf"
          value={rotationDay}
          onChange={(e) => onRotationDayChange(e.target.value)}
        >
          <option value="">Not set</option>
          {ROTATION_DAY_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
