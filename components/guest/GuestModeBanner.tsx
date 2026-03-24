"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

const GUEST_STORAGE_KEY = "macrofit_guest_mode";
const GUEST_COOKIE = "macrofit_guest";

export function GuestModeBanner() {
  const pathname = usePathname();
  const router = useRouter();
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    try {
      const value = localStorage.getItem(GUEST_STORAGE_KEY);
      setIsGuest(value === "1");
    } catch {
      setIsGuest(false);
    }
  }, [pathname]);

  if (!isGuest) {
    return null;
  }

  function onCreateAccount() {
    try {
      localStorage.removeItem(GUEST_STORAGE_KEY);
    } catch {
      // ignore
    }
    document.cookie = `${GUEST_COOKIE}=; path=/; max-age=0; samesite=lax`;
    router.push("/signup");
  }

  return (
    <div className="sticky top-0 z-50 border-b border-amber-300/40 bg-amber-100/90 px-4 py-2 text-amber-950 backdrop-blur dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
        <p className="text-xs sm:text-sm">
          Guest mode: data is saved only on this device.
        </p>
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          onClick={onCreateAccount}
        >
          Create Account
        </Button>
      </div>
    </div>
  );
}
