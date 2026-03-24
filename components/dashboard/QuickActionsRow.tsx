import Link from "next/link";

import { Dumbbell, TrendingUp, UtensilsCrossed } from "lucide-react";

import { Button } from "@/components/ui/button";

const actions = [
  { href: "/meals", label: "Log a Meal", icon: UtensilsCrossed },
  { href: "/workout", label: "Log Workout", icon: Dumbbell },
  { href: "/progress", label: "Check Progress", icon: TrendingUp },
] as const;

export function QuickActionsRow() {
  return (
    <section aria-labelledby="quick-actions-heading">
      <h2
        id="quick-actions-heading"
        className="text-lg font-semibold text-foreground"
      >
        Quick actions
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {actions.map(({ href, label, icon: Icon }) => (
          <Button key={href} variant="secondary" className="h-auto justify-start gap-2 py-3" asChild>
            <Link href={href}>
              <Icon className="shrink-0 opacity-80" aria-hidden />
              {label}
            </Link>
          </Button>
        ))}
      </div>
    </section>
  );
}
