"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function onSignOut() {
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="shrink-0 border-border bg-surface-2 text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={onSignOut}
    >
      Sign out
    </Button>
  );
}
