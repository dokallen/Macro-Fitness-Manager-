"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  ACTIVITY_LEVEL_OPTIONS,
  BIOLOGICAL_SEX_OPTIONS,
  PROFILE_KEYS,
  WEIGHT_UNITS,
  ageFromDob,
  changedProfileWrites,
  dobError,
  formatAge,
  localCalendarDate,
  profileError,
  readProfile,
  type Profile,
} from "@/lib/profile/profile";

const supabase = createBrowserSupabaseClient();

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type Form = {
  year: string;
  month: string;
  day: string;
  height: string;
  biologicalSex: string;
  activityLevel: string;
  goalWeight: string;
  goalWeightUnit: string;
};

const EMPTY: Form = {
  year: "",
  month: "",
  day: "",
  height: "",
  biologicalSex: "",
  activityLevel: "",
  goalWeight: "",
  goalWeightUnit: "",
};

function toForm(p: Profile): Form {
  return {
    year: p.dob.year !== undefined ? String(p.dob.year) : "",
    month: p.dob.month !== undefined ? String(p.dob.month) : "",
    day: p.dob.day !== undefined ? String(p.dob.day) : "",
    height: p.height ?? "",
    biologicalSex: p.biologicalSex ?? "",
    activityLevel: p.activityLevel ?? "",
    goalWeight: p.goalWeight !== undefined ? String(p.goalWeight) : "",
    goalWeightUnit: p.goalWeightUnit ?? "",
  };
}

function intOrUndefined(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isInteger(n) ? n : NaN;
}

const labelStyle = { fontSize: 12, color: "var(--text3)" } as const;
const inputClass =
  "h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface2)] px-2 text-sm text-[var(--text)]";

export function ProfileSection({ userId }: { userId: string }) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [stored, setStored] = useState<Profile>({ dob: {} });
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("key, value")
      .eq("user_id", userId)
      .in("key", Object.values(PROFILE_KEYS));
    if (error) {
      setLoadError(error.message);
      return;
    }
    const profile = readProfile(data ?? []);
    setStored(profile);
    setForm(toForm(profile));
    setLoadError(null);
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const dob = {
    year: intOrUndefined(form.year),
    month: intOrUndefined(form.month),
    day: intOrUndefined(form.day),
  };
  const today = localCalendarDate();
  const dobProblem = [dob.year, dob.month, dob.day].some((v) => Number.isNaN(v))
    ? "Use whole numbers for the date of birth."
    : dobError(dob, today);
  const age = dobProblem ? "" : formatAge(ageFromDob(dob, today));

  async function save() {
    if (dobProblem) {
      toast.error(dobProblem);
      return;
    }
    const gw = form.goalWeight.trim() ? Number(form.goalWeight) : undefined;
    if (gw !== undefined && !(Number.isFinite(gw) && gw > 0)) {
      toast.error("Enter a goal weight above 0, or leave it empty.");
      return;
    }
    const profile: Profile = {
      dob,
      height: form.height.trim() || undefined,
      biologicalSex: BIOLOGICAL_SEX_OPTIONS.find((o) => o === form.biologicalSex),
      activityLevel: ACTIVITY_LEVEL_OPTIONS.find((o) => o === form.activityLevel),
      goalWeight: gw,
      goalWeightUnit: WEIGHT_UNITS.find((o) => o === form.goalWeightUnit),
    };
    const problem = profileError(profile, today);
    if (problem) {
      toast.error(problem);
      return;
    }
    const { upserts, deletes } = changedProfileWrites(stored, profile);
    if (!upserts.length && !deletes.length) {
      toast("No changes to save.");
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (upserts.length) {
        const { error } = await supabase.from("user_preferences").upsert(
          upserts.map((u) => ({ user_id: userId, key: u.key, value: u.value, updated_by: "user" as const, updated_at: now })),
          { onConflict: "user_id,key" }
        );
        if (error) {
          toast.error(error.message);
          return;
        }
      }
      if (deletes.length) {
        const { error } = await supabase
          .from("user_preferences")
          .delete()
          .eq("user_id", userId)
          .in("key", deletes);
        if (error) {
          toast.error(error.message);
          return;
        }
      }
      toast.success("Profile saved.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="supp-card" style={{ marginTop: 20 }}>
        <p style={{ fontSize: 14, color: "var(--text2)" }}>Could not load your profile: {loadError}</p>
        <button type="button" className="cbtn yes" style={{ marginTop: 8 }} onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  }

  if (!loaded) {
    return (
      <p style={{ fontSize: 14, color: "var(--text2)", fontFamily: "var(--fb)", marginTop: 20 }}>
        Loading profile…
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
        👤 PROFILE
      </h2>

      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <p style={labelStyle}>Date of birth (optional){age ? ` · Age ${age}` : ""}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <select aria-label="Birth month" className={inputClass} value={form.month} onChange={set("month")}>
              <option value="">Month</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <input aria-label="Birth day" className={inputClass} style={{ width: 72 }} inputMode="numeric" placeholder="Day" value={form.day} onChange={set("day")} />
            <input aria-label="Birth year" className={inputClass} style={{ width: 90 }} inputMode="numeric" placeholder="Year" value={form.year} onChange={set("year")} />
          </div>
          {dobProblem ? (
            <p aria-live="polite" className="text-destructive" style={{ fontSize: 12, marginTop: 4 }}>
              {dobProblem}
            </p>
          ) : null}
          {form.year || form.month || form.day ? (
            <button
              type="button"
              style={{ fontSize: 12, color: "var(--accent)", marginTop: 4 }}
              onClick={() => setForm((f) => ({ ...f, year: "", month: "", day: "" }))}
            >
              Clear date of birth
            </button>
          ) : null}
        </div>

        <label>
          <span style={labelStyle}>Height</span>
          <input className={inputClass} placeholder={'e.g. 5"11 or 180 cm'} value={form.height} onChange={set("height")} />
        </label>

        <label>
          <span style={labelStyle}>Biological sex</span>
          <select className={inputClass} value={form.biologicalSex} onChange={set("biologicalSex")}>
            <option value="">Not set</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label>
          <span style={labelStyle}>Activity level</span>
          <select className={inputClass} value={form.activityLevel} onChange={set("activityLevel")}>
            <option value="">Not set</option>
            {ACTIVITY_LEVEL_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o.charAt(0).toUpperCase() + o.slice(1)}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span style={labelStyle}>Goal weight</span>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <input className={inputClass} inputMode="decimal" aria-label="Goal weight" value={form.goalWeight} onChange={set("goalWeight")} />
            <select aria-label="Goal weight unit" className={inputClass} style={{ width: 90 }} value={form.goalWeightUnit} onChange={set("goalWeightUnit")}>
              <option value="">Unit</option>
              {WEIGHT_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p style={{ fontSize: 12, color: "var(--text3)" }}>
          Current weight comes from your latest weigh-in.
        </p>

        <button type="button" className="cbtn yes" disabled={saving || Boolean(dobProblem)} onClick={() => void save()}>
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </div>
  );
}
