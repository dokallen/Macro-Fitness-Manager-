import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FIXTURE_NOW, FIXTURE_TZ, coachingFixture } from "@/lib/test-utils/coaching-fixture";
import { createFakeSupabase, type FakeSupabase } from "@/lib/test-utils/fake-supabase";

let fake: FakeSupabase;
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: () => fake.client }));

import { GET } from "@/app/api/targets/route";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXTURE_NOW);
  fake = createFakeSupabase(coachingFixture());
});
afterEach(() => vi.useRealTimers());

describe("GET /api/targets", () => {
  it("returns current targets, the own-numbers marker, and the calculation, writing nothing", async () => {
    const res = await GET(new Request(`http://x/api/targets?tz=${encodeURIComponent(FIXTURE_TZ)}`));
    const body = await res.json();
    expect(body.targets).toContainEqual({ key: "calories", value: "2200 kcal" });
    expect(body.own).toBeNull();
    expect(body.calculated.text).toMatch(/Calculated: Calories 2200 →/);
    expect(fake.writes).toEqual([]);
  });

  it("requires a signed-in user", async () => {
    fake = createFakeSupabase({}, null);
    expect((await GET(new Request("http://x/api/targets"))).status).toBe(401);
  });
});
