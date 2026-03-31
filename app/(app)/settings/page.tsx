import { cookies } from "next/headers";
import Link from "next/link";

import { SubpageHeader } from "@/components/layout/SubpageHeader";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function ButtonAsLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 py-2 font-heading text-sm uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90"
    >
      {children}
    </Link>
  );
}

export default async function SettingsPage() {
  const isGuest = cookies().get("macrofit_guest")?.value === "1";
  if (isGuest) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[var(--bg)] p-6">
        <p className="max-w-md text-center font-sans text-sm text-muted-foreground">
          Sign in to manage settings.
        </p>
        <ButtonAsLink href="/signup">Create Account</ButtonAsLink>
      </div>
    );
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-24">
      <SubpageHeader title="SETTINGS" subtitle="Targets & preferences" />
      <div className="px-4">
        <p style={{ fontSize: 14, color: "var(--text2)", fontFamily: "var(--fb)" }}>
          Macro targets and profile preferences are managed in onboarding. Use the
          menu to open onboarding anytime.
        </p>
        <Link
          href="/onboarding"
          className="back-btn"
          style={{ display: "inline-flex", marginTop: 16 }}
        >
          Open onboarding →
        </Link>
      </div>
    </div>
  );
}
