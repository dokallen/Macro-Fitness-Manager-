import Link from "next/link";
import { cookies } from "next/headers";

import { CoachClient } from "@/components/coach/CoachClient";
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

export default async function CoachPage() {
  const isGuest = cookies().get("macrofit_guest")?.value === "1";
  if (isGuest) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6">
        <p className="max-w-md text-center font-sans text-sm text-muted-foreground">
          Sign in to chat with your coach.
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
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <CoachClient userId={user.id} />
    </div>
  );
}
