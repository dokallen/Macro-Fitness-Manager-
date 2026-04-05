import { cookies } from "next/headers";

import { WorkoutClient } from "@/components/workout/WorkoutClient";
import { WorkoutOnboarding } from "@/components/workout/WorkoutOnboarding";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function WorkoutPage() {
  const isGuest = cookies().get("macrofit_guest")?.value === "1";
  if (isGuest) {
    return <WorkoutClient />;
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: splits, error } = await supabase
    .from("workout_splits")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);

  if (error) {
    return <WorkoutClient />;
  }

  if (!splits?.length) {
    return <WorkoutOnboarding userId={user.id} />;
  }

  return <WorkoutClient />;
}
