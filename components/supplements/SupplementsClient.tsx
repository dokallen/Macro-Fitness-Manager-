"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { SubpageHeader } from "@/components/layout/SubpageHeader";

const STORAGE_KEY = "mf_supplementStack";

export type TimeOfDay =
  | "Morning"
  | "Pre-workout"
  | "Post-workout"
  | "Evening"
  | "With meals";

export type SupplementItem = {
  id: string;
  name: string;
  dosage: string;
  timeOfDay: TimeOfDay;
  purpose: string;
};

const TIME_ORDER: TimeOfDay[] = [
  "Morning",
  "Pre-workout",
  "Post-workout",
  "Evening",
  "With meals",
];

const TIME_COLORS: Record<TimeOfDay, string> = {
  Morning: "#f59e0b",
  "Pre-workout": "#3b82f6",
  "Post-workout": "#10b981",
  Evening: "#8b5cf6",
  "With meals": "#06b6d4",
};

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadStack(): SupplementItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is SupplementItem =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as SupplementItem).id === "string" &&
        typeof (x as SupplementItem).name === "string"
    );
  } catch {
    return [];
  }
}

function saveStack(items: SupplementItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function stackSummaryText(items: SupplementItem[]): string {
  if (items.length === 0) return "";
  return items
    .map(
      (s) =>
        `- ${s.name}: ${s.dosage || "—"} at ${s.timeOfDay}. Purpose: ${s.purpose || "—"}`
    )
    .join("\n");
}

export function SupplementsClient() {
  const [stack, setStack] = useState<SupplementItem[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const [tipLoading, setTipLoading] = useState(false);
  const [tipError, setTipError] = useState<string | null>(null);

  const [customName, setCustomName] = useState("");
  const [customDosage, setCustomDosage] = useState("");
  const [customTime, setCustomTime] = useState<TimeOfDay>("Morning");
  const [customPurpose, setCustomPurpose] = useState("");

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [askCoachLoading, setAskCoachLoading] = useState<string | null>(null);

  useEffect(() => {
    setStack(loadStack());
  }, []);

  const persist = useCallback((next: SupplementItem[]) => {
    setStack(next);
    saveStack(next);
  }, []);

  const groupedSchedule = useMemo(() => {
    const m = new Map<TimeOfDay, SupplementItem[]>();
    for (const t of TIME_ORDER) m.set(t, []);
    for (const s of stack) {
      const list = m.get(s.timeOfDay) ?? [];
      list.push(s);
      m.set(s.timeOfDay, list);
    }
    return m;
  }, [stack]);

  const refreshTip = useCallback(async () => {
    setTipLoading(true);
    setTipError(null);
    try {
      const res = await fetch("/api/coach-tip-supplement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stackSummary: stackSummaryText(stack),
        }),
      });
      const data = (await res.json()) as { tip?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load tip");
      }
      setTip(data.tip ?? "");
    } catch (e) {
      setTipError(e instanceof Error ? e.message : "Error");
      setTip(null);
    } finally {
      setTipLoading(false);
    }
  }, [stack]);

  const openAddSheet = () => {
    setCustomName("");
    setCustomDosage("");
    setCustomPurpose("");
    setCustomTime("Morning");
    setSheetOpen(true);
  };

  const addCustom = () => {
    const n = customName.trim();
    if (!n) return;
    persist([
      ...stack,
      {
        id: uid(),
        name: n,
        dosage: customDosage.trim() || "—",
        timeOfDay: customTime,
        purpose: customPurpose.trim(),
      },
    ]);
    setCustomName("");
    setCustomDosage("");
    setCustomPurpose("");
    setCustomTime("Morning");
    setSheetOpen(false);
  };

  const askAboutItem = async (item: SupplementItem) => {
    setAskCoachLoading(item.id);
    try {
      const res = await fetch("/api/coach-tip-supplement", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stackSummary: stackSummaryText([item]),
        }),
      });
      const data = (await res.json()) as { tip?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setTip(data.tip ?? "");
      setTipError(null);
    } catch (e) {
      setTipError(e instanceof Error ? e.message : "Error");
    } finally {
      setAskCoachLoading(null);
    }
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    persist(stack.filter((s) => s.id !== deleteId));
    setDeleteId(null);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-0 pb-24">
      <SubpageHeader title="SUPPLEMENTS" subtitle="Your daily stack" />

      <div className="px-4 pb-4">
        <div
          style={{
            background: "linear-gradient(135deg,#0d1e33,#111827)",
            border: "1px solid #3b82f644",
            borderRadius: 14,
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text2)",
                  marginBottom: 6,
                  fontFamily: "var(--fb)",
                }}
              >
                Coach tip
              </p>
              <p
                style={{
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: "var(--text)",
                  fontFamily: "var(--fb)",
                }}
              >
                {tipLoading
                  ? "…"
                  : tipError
                    ? tipError
                    : tip ?? "Tap refresh for a tip about your stack."}
              </p>
            </div>
            <button
              type="button"
              className="cbtn green"
              style={{ flexShrink: 0, padding: "8px 12px", fontSize: 12 }}
              onClick={() => void refreshTip()}
              disabled={tipLoading}
            >
              Refresh
            </button>
          </div>
        </div>

        <h2
          style={{
            fontFamily: "var(--fd)",
            fontSize: 14,
            letterSpacing: 2,
            marginTop: 20,
            marginBottom: 8,
          }}
        >
          DAILY SCHEDULE
        </h2>
        {TIME_ORDER.map((t) => {
          const items = groupedSchedule.get(t) ?? [];
          if (items.length === 0) return null;
          return (
            <div key={t} style={{ marginBottom: 12 }}>
              <div
                className="time-badge"
                style={{
                  background: `${TIME_COLORS[t]}22`,
                  color: TIME_COLORS[t],
                  marginBottom: 6,
                }}
              >
                {t.toUpperCase()}
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {items.map((s) => (
                  <li key={s.id} style={{ marginBottom: 4 }}>
                    {s.name}
                    {s.dosage ? ` — ${s.dosage}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        <h2
          style={{
            fontFamily: "var(--fd)",
            fontSize: 14,
            letterSpacing: 2,
            marginTop: 20,
            marginBottom: 8,
          }}
        >
          MY STACK
        </h2>

        {stack.map((s) => (
          <div key={s.id} className="supp-card">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--fd)",
                  fontSize: 17,
                  letterSpacing: 0.5,
                }}
              >
                {s.name}
              </div>
              <button
                type="button"
                className="cbtn danger"
                style={{ padding: "6px 10px", fontSize: 11 }}
                onClick={() => setDeleteId(s.id)}
              >
                Delete
              </button>
            </div>
            <div style={{ flexWrap: "wrap", display: "flex", gap: 6 }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "3px 9px",
                  borderRadius: 20,
                  fontSize: 10,
                  fontWeight: 600,
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                }}
              >
                {s.dosage}
              </span>
              <span
                className="time-badge"
                style={{
                  background: `${TIME_COLORS[s.timeOfDay]}33`,
                  color: TIME_COLORS[s.timeOfDay],
                }}
              >
                {s.timeOfDay}
              </span>
            </div>
            {s.purpose ? (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text2)",
                  marginTop: 8,
                  marginBottom: 0,
                }}
              >
                {s.purpose}
              </p>
            ) : null}
            <button
              type="button"
              className="cbtn"
              style={{
                marginTop: 10,
                padding: "8px 12px",
                fontSize: 12,
                background: "var(--surface2)",
                color: "var(--accent)",
                border: "1px solid var(--border)",
              }}
              onClick={() => void askAboutItem(s)}
              disabled={askCoachLoading === s.id}
            >
              {askCoachLoading === s.id ? "…" : "Ask Coach"}
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={openAddSheet}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "18px 16px",
            borderRadius: 14,
            border: "2px dashed var(--border)",
            background: "transparent",
            color: "var(--accent)",
            fontFamily: "var(--fb)",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          + Add supplement
        </button>
      </div>

      <button
        type="button"
        className={`sheet-overlay${sheetOpen ? " open" : ""}`}
        aria-label="Close add sheet"
        onClick={() => setSheetOpen(false)}
      />
      <div
        className={`bottom-sheet-base${sheetOpen ? " open" : ""}`}
        style={{
          maxHeight: "72vh",
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ padding: "12px 16px 8px" }}>
          <h3
            style={{
              fontFamily: "var(--fd)",
              fontSize: 16,
              letterSpacing: 1,
              marginBottom: 12,
            }}
          >
            Add supplement
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ fontSize: 12, color: "var(--text2)" }}>
              Name
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: 4,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                  fontFamily: "var(--fb)",
                }}
              />
            </label>
            <label style={{ fontSize: 12, color: "var(--text2)" }}>
              Dosage
              <input
                value={customDosage}
                onChange={(e) => setCustomDosage(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: 4,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                  fontFamily: "var(--fb)",
                }}
              />
            </label>
            <label style={{ fontSize: 12, color: "var(--text2)" }}>
              Time of day
              <select
                value={customTime}
                onChange={(e) =>
                  setCustomTime(e.target.value as TimeOfDay)
                }
                style={{
                  width: "100%",
                  marginTop: 4,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                  fontFamily: "var(--fb)",
                }}
              >
                {TIME_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--text2)" }}>
              Purpose
              <textarea
                value={customPurpose}
                onChange={(e) => setCustomPurpose(e.target.value)}
                rows={2}
                style={{
                  width: "100%",
                  marginTop: 4,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                  fontFamily: "var(--fb)",
                }}
              />
            </label>
            <button
              type="button"
              className="cbtn green"
              onClick={addCustom}
              style={{ marginTop: 8 }}
            >
              Save supplement
            </button>
          </div>
        </div>
      </div>

      <div className={`conf-ov${deleteId ? " open" : ""}`} role="presentation">
        <div className="conf-box">
          <p style={{ fontFamily: "var(--fb)", marginBottom: 8 }}>
            Remove this supplement from your stack?
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="cbtn no"
              onClick={() => setDeleteId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cbtn danger"
              onClick={confirmDelete}
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
