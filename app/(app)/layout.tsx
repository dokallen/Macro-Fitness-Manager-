import { AppNavLink } from "@/components/navigation/AppNavLink";
import {
  Activity,
  BarChart3,
  Dumbbell,
  Home,
  MessageCircle,
  UtensilsCrossed,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/workout", label: "Workout", Icon: Dumbbell },
  { href: "/progress", label: "Progress", Icon: BarChart3 },
  { href: "/cardio", label: "Cardio", Icon: Activity },
  { href: "/meals", label: "Meals", Icon: UtensilsCrossed },
  { href: "/coach", label: "Coach", Icon: MessageCircle },
] as const;

export default function AppGroupLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-dvh flex-1 bg-background text-foreground">
      <aside className="hidden w-64 border-r border-border bg-card md:flex md:flex-col">
        <div className="px-5 py-6">
          <p className="section-label text-foreground/90">Macro Fit</p>
          <nav className="mt-4 space-y-1">
            {NAV_ITEMS.map(({ href, label, Icon }) => (
              <AppNavLink
                key={href}
                href={href}
                className="flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-sans text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                activeClassName="text-primary"
              >
                <Icon className="size-4" aria-hidden />
                <span>{label}</span>
              </AppNavLink>
            ))}
          </nav>
        </div>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
        <main className="flex min-h-0 flex-1 flex-col bg-background text-foreground pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+4.5rem)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:pb-[env(safe-area-inset-bottom)]">
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card md:hidden">
          <div className="grid grid-cols-6 px-0.5 pb-[env(safe-area-inset-bottom)] pt-1 sm:px-1">
            {NAV_ITEMS.map(({ href, label, Icon }) => (
              <AppNavLink
                key={href}
                href={href}
                className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-sans font-medium leading-tight text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:text-[11px]"
                activeClassName="text-primary"
              >
                <Icon className="size-4" aria-hidden />
                <span>{label}</span>
              </AppNavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
