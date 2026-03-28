import { AppBottomNav } from "@/components/layout/AppBottomNav";
import { CoachFabPanel } from "@/components/home/CoachFabPanel";

export default function AppGroupLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background text-foreground">
      <main
        className="flex min-h-0 flex-1 flex-col bg-[var(--bg)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] text-[var(--text)]"
        style={{
          paddingBottom:
            "calc(5.75rem + max(20px, env(safe-area-inset-bottom)))",
        }}
      >
        {children}
      </main>
      <AppBottomNav />
      <CoachFabPanel />
    </div>
  );
}
