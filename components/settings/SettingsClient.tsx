"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { subscribeToPushNotifications } from "@/components/notifications/PushNotificationClient";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const PREF_PUSH_SUBSCRIPTION = "push_subscription";
const PREF_MORNING_TIME = "notification_morning_time";
const PREF_MORNING_ENABLED = "notification_morning_enabled";
const PREF_WORKOUT_REMINDER = "notification_workout_reminder";
const PREF_MIDDAY_TIME = "notification_midday_time";
const PREF_MIDDAY_ENABLED = "notification_midday_enabled";
const PREF_EVENING_TIME = "notification_evening_time";
const PREF_EVENING_ENABLED = "notification_evening_enabled";
const PREF_STREAKS = "notification_streaks";
const PREF_MEAL_ROTATION = "notification_meal_rotation";
const PREF_TIMEZONE = "notification_timezone";

const NOTIFICATION_KEYS = [
  PREF_PUSH_SUBSCRIPTION,
  PREF_MORNING_TIME,
  PREF_MORNING_ENABLED,
  PREF_WORKOUT_REMINDER,
  PREF_MIDDAY_TIME,
  PREF_MIDDAY_ENABLED,
  PREF_EVENING_TIME,
  PREF_EVENING_ENABLED,
  PREF_STREAKS,
  PREF_MEAL_ROTATION,
  PREF_TIMEZONE,
] as const;

function isTruthy(v: string | undefined): boolean {
  return v?.trim().toLowerCase() === "true";
}

type Props = {
  userId: string;
};

function NotifToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`habit-row${checked ? " checked" : ""}`}
      style={{ width: "100%", textAlign: "left" }}
      onClick={() => onChange(!checked)}
    >
      <span className="habit-chk" aria-hidden>
        {checked ? "✓" : ""}
      </span>
      <span className="habit-label" style={{ fontSize: 14, color: "var(--text)" }}>
        {label}
      </span>
    </button>
  );
}

export function SettingsClient({ userId }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [morningEnabled, setMorningEnabled] = useState(true);
  const [morningTime, setMorningTime] = useState("07:00");
  const [workoutReminder, setWorkoutReminder] = useState(true);
  const [middayEnabled, setMiddayEnabled] = useState(true);
  const [middayTime, setMiddayTime] = useState("12:00");
  const [eveningEnabled, setEveningEnabled] = useState(true);
  const [eveningTime, setEveningTime] = useState("20:00");
  const [streaks, setStreaks] = useState(true);
  const [mealRotation, setMealRotation] = useState(true);
  const [enabling, setEnabling] = useState(false);

  const upsertPref = useCallback(
    async (key: string, value: string) => {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.from("user_preferences").upsert(
        {
          user_id: userId,
          key,
          value,
          updated_by: "user",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,key" }
      );
      if (error) toast.error(error.message);
      return !error;
    },
    [userId]
  );

  const loadPrefs = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase
      .from("user_preferences")
      .select("key, value")
      .eq("user_id", userId)
      .in("key", [...NOTIFICATION_KEYS]);
    if (error) {
      toast.error(error.message);
      setLoaded(true);
      return;
    }
    const map = Object.fromEntries(
      (data ?? []).map((r) => [r.key, r.value] as const)
    );
    setPushEnabled(Boolean(map[PREF_PUSH_SUBSCRIPTION]?.trim()));
    setMorningEnabled(map[PREF_MORNING_ENABLED]?.trim().toLowerCase() !== "false");
    setMorningTime(map[PREF_MORNING_TIME]?.trim() || "07:00");
    setWorkoutReminder(isTruthy(map[PREF_WORKOUT_REMINDER]) || !map[PREF_WORKOUT_REMINDER]);
    setMiddayEnabled(map[PREF_MIDDAY_ENABLED]?.trim().toLowerCase() !== "false");
    setMiddayTime(map[PREF_MIDDAY_TIME]?.trim() || "12:00");
    setEveningEnabled(map[PREF_EVENING_ENABLED]?.trim().toLowerCase() !== "false");
    setEveningTime(map[PREF_EVENING_TIME]?.trim() || "20:00");
    setStreaks(isTruthy(map[PREF_STREAKS]) || !map[PREF_STREAKS]);
    setMealRotation(isTruthy(map[PREF_MEAL_ROTATION]) || !map[PREF_MEAL_ROTATION]);
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    void loadPrefs();
  }, [loadPrefs]);

  async function onMasterToggle(next: boolean) {
    if (next) {
      setEnabling(true);
      const ok = await subscribeToPushNotifications(userId);
      setEnabling(false);
      if (ok) {
        setPushEnabled(true);
        void loadPrefs();
      }
      return;
    }
    setPushEnabled(false);
    await upsertPref(PREF_PUSH_SUBSCRIPTION, "");
  }

  async function onEnableInBrowser() {
    setEnabling(true);
    const ok = await subscribeToPushNotifications(userId);
    setEnabling(false);
    if (ok) {
      setPushEnabled(true);
      void loadPrefs();
    }
  }

  async function saveBool(key: string, value: boolean, setter: (v: boolean) => void) {
    setter(value);
    await upsertPref(key, value ? "true" : "false");
  }

  async function saveTime(key: string, value: string, setter: (v: string) => void) {
    setter(value);
    await upsertPref(key, value);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    await upsertPref(PREF_TIMEZONE, tz);
  }

  if (!loaded) {
    return (
      <p style={{ fontSize: 14, color: "var(--text2)", fontFamily: "var(--fb)" }}>
        Loading notification settings…
      </p>
    );
  }

  return (
    <div className="supp-card" style={{ marginTop: 20 }}>
      <h2
        style={{
          fontFamily: "var(--fd)",
          fontSize: 13,
          letterSpacing: 2,
          color: "var(--accent3)",
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        🔔 NOTIFICATIONS
      </h2>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <span style={{ fontSize: 14, color: "var(--text)" }}>
          Status: {pushEnabled ? "Enabled" : "Disabled"}
        </span>
        <button
          type="button"
          className={`habit-chk${pushEnabled ? "" : ""}`}
          style={{
            width: 44,
            height: 24,
            borderRadius: 12,
            border: "none",
            background: pushEnabled ? "var(--accent2)" : "var(--surface2)",
            position: "relative",
            cursor: enabling ? "wait" : "pointer",
            flexShrink: 0,
          }}
          disabled={enabling}
          aria-label={pushEnabled ? "Disable notifications" : "Enable notifications"}
          onClick={() => void onMasterToggle(!pushEnabled)}
        >
          <span
            style={{
              position: "absolute",
              top: 3,
              left: pushEnabled ? 22 : 3,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#fff",
              transition: "left 0.2s",
            }}
          />
        </button>
      </div>

      {!pushEnabled ? (
        <button
          type="button"
          className="cbtn yes"
          style={{ width: "100%" }}
          disabled={enabling}
          onClick={() => void onEnableInBrowser()}
        >
          Enable in browser
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ marginBottom: 8 }}>
            <NotifToggle
              checked={morningEnabled}
              label="Morning Motivation"
              onChange={(v) => void saveBool(PREF_MORNING_ENABLED, v, setMorningEnabled)}
            />
            {morningEnabled ? (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  margin: "4px 0 8px 34px",
                  fontSize: 13,
                  color: "var(--text2)",
                }}
              >
                Time
                <input
                  type="time"
                  className="inf"
                  value={morningTime}
                  onChange={(e) =>
                    void saveTime(PREF_MORNING_TIME, e.target.value, setMorningTime)
                  }
                />
              </label>
            ) : null}
          </div>

          <NotifToggle
            checked={workoutReminder}
            label="Workout Reminders"
            onChange={(v) =>
              void saveBool(PREF_WORKOUT_REMINDER, v, setWorkoutReminder)
            }
          />

          <div style={{ marginBottom: 8 }}>
            <NotifToggle
              checked={middayEnabled}
              label="Midday Check-in"
              onChange={(v) => void saveBool(PREF_MIDDAY_ENABLED, v, setMiddayEnabled)}
            />
            {middayEnabled ? (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  margin: "4px 0 8px 34px",
                  fontSize: 13,
                  color: "var(--text2)",
                }}
              >
                Time
                <input
                  type="time"
                  className="inf"
                  value={middayTime}
                  onChange={(e) =>
                    void saveTime(PREF_MIDDAY_TIME, e.target.value, setMiddayTime)
                  }
                />
              </label>
            ) : null}
          </div>

          <div style={{ marginBottom: 8 }}>
            <NotifToggle
              checked={eveningEnabled}
              label="Evening Recap"
              onChange={(v) => void saveBool(PREF_EVENING_ENABLED, v, setEveningEnabled)}
            />
            {eveningEnabled ? (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  margin: "4px 0 8px 34px",
                  fontSize: 13,
                  color: "var(--text2)",
                }}
              >
                Time
                <input
                  type="time"
                  className="inf"
                  value={eveningTime}
                  onChange={(e) =>
                    void saveTime(PREF_EVENING_TIME, e.target.value, setEveningTime)
                  }
                />
              </label>
            ) : null}
          </div>

          <NotifToggle
            checked={streaks}
            label="Streak Celebrations"
            onChange={(v) => void saveBool(PREF_STREAKS, v, setStreaks)}
          />

          <NotifToggle
            checked={mealRotation}
            label="Meal Plan Rotation Reminder"
            onChange={(v) => void saveBool(PREF_MEAL_ROTATION, v, setMealRotation)}
          />
        </div>
      )}
    </div>
  );
}
