import Link from "next/link";

import { Button } from "@/components/ui/button";

type Props = {
  isTrainingDay: boolean;
  frequencySummary: string;
};

export function WorkoutDayCard({ isTrainingDay, frequencySummary }: Props) {
  return (
    <section
      className="macro-card"
      aria-labelledby="workout-day-heading"
    >
      <h2 id="workout-day-heading" className="font-heading text-xl tracking-[0.125em] text-foreground">
        Today&apos;s workout
      </h2>
      {frequencySummary ? (
        <p className="mt-1 text-sm font-sans text-muted-foreground">{frequencySummary}</p>
      ) : null}

      <div className="mt-4">
        {isTrainingDay ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-sans text-foreground">
              Training day — you&apos;ve got a session on the calendar.
            </p>
            <Button asChild className="shrink-0">
              <Link href="/workout">Start Workout</Link>
            </Button>
          </div>
        ) : (
          <p className="text-sm font-sans text-foreground">
            Rest day — recovery is part of the plan. Light movement or mobility is
            fine if you feel like it.
          </p>
        )}
      </div>
    </section>
  );
}
