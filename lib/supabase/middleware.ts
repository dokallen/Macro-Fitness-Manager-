import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Unauthenticated users may access these routes only. */
const PUBLIC_PATHS = new Set([
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
]);
const GUEST_COOKIE = "macrofit_guest";

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname);
}

/** Logged-in users are redirected away from these (to home or onboarding). */
const AUTH_ENTRY_PATHS = new Set(["/login", "/signup", "/forgot-password"]);

function applyCookies(
  target: NextResponse,
  cookies: {
    name: string;
    value: string;
    options?: Parameters<NextResponse["cookies"]["set"]>[2];
  }[]
) {
  cookies.forEach(({ name, value, options }) => {
    target.cookies.set(name, value, options);
  });
}

export async function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({
    request,
  });
  const pathname = request.nextUrl.pathname;
  const isGuest = request.cookies.get(GUEST_COOKIE)?.value === "1";

  if (isGuest) {
    if (pathname === "/onboarding") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/";
      return NextResponse.redirect(redirectUrl);
    }
    if (pathname === "/login") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/";
      return NextResponse.redirect(redirectUrl);
    }
    return supabaseResponse;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return supabaseResponse;
  }

  let cookieMutations: {
    name: string;
    value: string;
    options?: Parameters<NextResponse["cookies"]["set"]>[2];
  }[] = [];

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookieMutations = cookiesToSet;
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (!isPublicPath(pathname)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      const redirect = NextResponse.redirect(redirectUrl);
      applyCookies(redirect, cookieMutations);
      return redirect;
    }
    return supabaseResponse;
  }

  /** App Router API routes must not be caught by onboarding/page redirects — fetch() would follow HTML redirects and break JSON clients. */
  if (pathname.startsWith("/api")) {
    return supabaseResponse;
  }

  if (pathname === "/reset-password") {
    return supabaseResponse;
  }

  let onboardingComplete = false;
  try {
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("onboarding_complete")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Failed to fetch onboarding status:", profileError.message);
      if (pathname === "/onboarding") {
        return supabaseResponse;
      }
    } else {
      onboardingComplete = profile?.onboarding_complete ?? false;
    }
  } catch (error) {
    console.error("Unexpected onboarding status error:", error);
    if (pathname === "/onboarding") {
      return supabaseResponse;
    }
  }

  if (AUTH_ENTRY_PATHS.has(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = onboardingComplete ? "/" : "/onboarding";
    const redirect = NextResponse.redirect(redirectUrl);
    applyCookies(redirect, cookieMutations);
    return redirect;
  }

  if (!onboardingComplete && pathname !== "/onboarding") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/onboarding";
    const redirect = NextResponse.redirect(redirectUrl);
    applyCookies(redirect, cookieMutations);
    return redirect;
  }

  if (onboardingComplete && pathname === "/onboarding") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    const redirect = NextResponse.redirect(redirectUrl);
    applyCookies(redirect, cookieMutations);
    return redirect;
  }

  return supabaseResponse;
}
