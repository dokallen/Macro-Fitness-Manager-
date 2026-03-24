"use client";

import { SignOutButton } from "@/components/auth/SignOutButton";

function greetingForHour(hour: number): "Good morning" | "Good afternoon" | "Good evening" {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardHeader({ displayName }: { displayName: string }) {
  const hour = new Date().getHours();
  const greet = greetingForHour(hour);

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-sm text-muted-foreground">{greet}</p>
        <h1 className="mt-1 font-sans text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {displayName || "Athlete"}
        </h1>
      </div>
      <SignOutButton />
    </header>
  );
}
