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
        <p className="section-label">{greet}</p>
        <h1 className="page-title mt-2">{displayName || "Athlete"}</h1>
      </div>
      <SignOutButton />
    </header>
  );
}
