import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// No Supabase session: getUser() resolves with no user, the same as a Vercel Cron request.
const getUser = vi.fn(async () => ({ data: { user: null }, error: null }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

import { isCronPath, updateSession } from "@/lib/supabase/middleware";

beforeAll(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://placeholder.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_placeholder");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  getUser.mockClear();
});

function request(path: string) {
  return new NextRequest(new URL(path, "https://macro-fit.example"));
}

function redirectsToLogin(res: Response) {
  const location = res.headers.get("location");
  return res.status >= 300 && res.status < 400 && location !== null
    ? new URL(location).pathname === "/login"
    : false;
}

describe("isCronPath", () => {
  it("matches exactly the two Vercel Cron routes", () => {
    expect(isCronPath("/api/meal-plan-rotate")).toBe(true);
    expect(isCronPath("/api/push-notify")).toBe(true);
  });

  it("rejects other API routes, lookalikes and sub-paths", () => {
    for (const p of [
      "/api/coach-chat",
      "/api/push-notify-x",
      "/api/push-notify/extra",
      "/api/meal-plan-rotate2",
      "/api",
      "/",
    ]) {
      expect(isCronPath(p), p).toBe(false);
    }
  });
});

describe("updateSession without a Supabase session", () => {
  it.each([
    "/api/meal-plan-rotate",
    "/api/push-notify",
    "/api/push-notify?type=morning_motivation",
    "/api/push-notify?type=meal_plan_rotation",
  ])("lets the cron route %s through to its handler", async (path) => {
    const res = await updateSession(request(path));
    expect(redirectsToLogin(res)).toBe(false);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    // The cron exemption returns before any Supabase session lookup.
    expect(getUser).not.toHaveBeenCalled();
  });

  it.each(["/", "/meals", "/api/coach-chat", "/api/push-notify-x", "/api/meal-plan-rotate/x"])(
    "still redirects %s to /login",
    async (path) => {
      const res = await updateSession(request(path));
      expect(redirectsToLogin(res)).toBe(true);
      expect(getUser).toHaveBeenCalledTimes(1);
    }
  );

  it("still serves the login page itself", async () => {
    const res = await updateSession(request("/login"));
    expect(redirectsToLogin(res)).toBe(false);
  });
});
