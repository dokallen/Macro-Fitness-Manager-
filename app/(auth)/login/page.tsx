"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { type LoginInput, loginSchema } from "@/lib/validations";

const GUEST_STORAGE_KEY = "macrofit_guest_mode";
const GUEST_COOKIE = "macrofit_guest";

export default function LoginPage() {
  const router = useRouter();
  const [showGuestWarning, setShowGuestWarning] = useState(false);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    try {
      localStorage.removeItem(GUEST_STORAGE_KEY);
    } catch {
      // ignore
    }
    document.cookie = `${GUEST_COOKIE}=; path=/; max-age=0; samesite=lax`;

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Signed in.");
    router.push("/");
    router.refresh();
  }

  function continueAsGuest() {
    try {
      localStorage.setItem(GUEST_STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    document.cookie = `${GUEST_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
    router.push("/");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Macro Fit — your data, your rules.
        </p>
      </div>
      <form
        className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm"
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            {...form.register("email")}
          />
          {form.formState.errors.email?.message ? (
            <p className="text-sm text-destructive" role="alert">
              {form.formState.errors.email.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...form.register("password")}
          />
          {form.formState.errors.password?.message ? (
            <p className="text-sm text-destructive" role="alert">
              {form.formState.errors.password.message}
            </p>
          ) : null}
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => setShowGuestWarning((v) => !v)}
        >
          Continue as Guest
        </Button>
        {showGuestWarning ? (
          <div className="space-y-3 rounded-md border border-amber-300/50 bg-amber-100/60 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            <p className="font-medium">Before continuing in guest mode:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Data will only be saved on this device.</li>
              <li>No access from other devices.</li>
              <li>No account recovery if data is lost.</li>
              <li>You can create an account anytime to save progress.</li>
            </ul>
            <Button
              type="button"
              className="w-full"
              onClick={continueAsGuest}
            >
              I understand, continue as guest
            </Button>
          </div>
        ) : null}
      </form>
      <p className="text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link
          href="/signup"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
