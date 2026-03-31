import { cookies } from "next/headers";
import Link from "next/link";

import { JournalClient } from "@/components/journal/JournalClient";
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

export default async function JournalPage() {
  const isGuest = cookies().get("macrofit_guest")?.value === "1";
  if (isGuest) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[var(--bg)] p-6">
        <p className="max-w-md text-center font-sans text-sm text-muted-foreground">
          Sign in to use your fitness journal.
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

  return <JournalClient />;
}
