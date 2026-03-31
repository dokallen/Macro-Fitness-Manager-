"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "mf_fitnessJournal";

export type JournalEntry = {
  id: string;
  createdAt: string;
  mood: 1 | 2 | 3 | 4 | 5;
  tag: string;
  text: string;
};

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadEntries(): JournalEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is JournalEntry =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as JournalEntry).id === "string" &&
        typeof (x as JournalEntry).text === "string"
    );
  } catch {
    return [];
  }
}

function saveEntries(entries: JournalEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function JournalClient() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewEntry, setViewEntry] = useState<JournalEntry | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [tag, setTag] = useState<string>("");
  const [mood, setMood] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [text, setText] = useState("");
  const [promptLoading, setPromptLoading] = useState(false);

  useEffect(() => {
    setEntries(loadEntries());
  }, []);

  const persist = useCallback((next: JournalEntry[]) => {
    setEntries(next);
    saveEntries(next);
  }, []);

  const sorted = useMemo(
    () =>
      [...entries].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [entries]
  );

  const openNew = () => {
    setEditingId(null);
    setTag("");
    setMood(3);
    setText("");
    setSheetOpen(true);
  };

  const openEdit = (e: JournalEntry) => {
    setEditingId(e.id);
    setTag(e.tag);
    setMood(e.mood);
    setText(e.text);
    setSheetOpen(true);
    setViewEntry(null);
  };

  const saveEntry = () => {
    const t = text.trim();
    if (!t) return;
    if (editingId) {
      persist(
        entries.map((e) =>
          e.id === editingId
            ? { ...e, tag, mood, text: t }
            : e
        )
      );
    } else {
      persist([
        {
          id: uid(),
          createdAt: new Date().toISOString(),
          tag,
          mood,
          text: t,
        },
        ...entries,
      ]);
    }
    setSheetOpen(false);
    setEditingId(null);
  };

  const deleteEntry = () => {
    if (!deleteId) return;
    persist(entries.filter((e) => e.id !== deleteId));
    setDeleteId(null);
    setViewEntry(null);
  };

  const fetchPrompt = async () => {
    setPromptLoading(true);
    try {
      const res = await fetch("/api/journal-prompt", { method: "POST" });
      const data = (await res.json()) as { prompt?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      if (data.prompt) setText(data.prompt);
    } catch {
      setText((prev) => prev);
    } finally {
      setPromptLoading(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-0 pb-24">
      <header className="ph">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Link href="/" className="back-btn">
              ← Back
            </Link>
            <h1 className="pt">FITNESS JOURNAL</h1>
            <p className="ps">Reflect & track</p>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              paddingTop: 4,
            }}
          >
            <button
              type="button"
              className="cbtn"
              style={{
                padding: "8px 10px",
                fontSize: 12,
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
              onClick={() => void fetchPrompt()}
              disabled={promptLoading}
              title="AI prompt"
            >
              {promptLoading ? "…" : "✨ Prompt"}
            </button>
            <button
              type="button"
              className="cbtn green"
              style={{ padding: "8px 10px", fontSize: 12 }}
              onClick={openNew}
            >
              ✏️ New
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 pb-4">
        {sorted.map((e) => (
          <button
            key={e.id}
            type="button"
            className="journal-card"
            style={{
              width: "100%",
              textAlign: "left",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--fb)",
            }}
            onClick={() => setViewEntry(e)}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 12, color: "var(--text2)" }}>
                {formatDate(e.createdAt)}
              </span>
              {e.tag.trim() ? (
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 8,
                    fontSize: 10,
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {e.tag}
                </span>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <span
                  key={n}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background:
                      n <= e.mood ? "var(--accent2)" : "var(--surface2)",
                    border: "1px solid var(--border)",
                  }}
                />
              ))}
            </div>
            <p
              style={{
                fontSize: 13,
                color: "var(--text)",
                margin: 0,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {e.text}
            </p>
          </button>
        ))}
      </div>

      <button
        type="button"
        className={`sheet-overlay${sheetOpen ? " open" : ""}`}
        aria-label="Close editor"
        onClick={() => {
          setSheetOpen(false);
          setEditingId(null);
        }}
      />
      <div
        className={`bottom-sheet-base${sheetOpen ? " open" : ""}`}
        style={{
          maxHeight: "78vh",
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ padding: "16px 16px 8px" }}>
          <h3
            style={{
              fontFamily: "var(--fd)",
              fontSize: 18,
              marginBottom: 12,
              letterSpacing: 1,
            }}
          >
            {editingId ? "Edit entry" : "New entry"}
          </h3>
          <label style={{ fontSize: 11, color: "var(--text2)", marginBottom: 6 }}>
            Tag (optional)
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder=""
              style={{
                display: "block",
                width: "100%",
                marginTop: 6,
                padding: 10,
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
                fontFamily: "var(--fb)",
                fontSize: 13,
                marginBottom: 12,
              }}
            />
          </label>
          <p style={{ fontSize: 11, color: "var(--text2)", marginBottom: 6 }}>
            Mood (1–5)
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setMood(n)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  border:
                    mood === n
                      ? "2px solid var(--accent2)"
                      : "1px solid var(--border)",
                  background: mood === n ? "var(--accent2)" : "var(--surface2)",
                  color: mood === n ? "#fff" : "var(--text)",
                  fontFamily: "var(--fd)",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write your entry…"
            rows={6}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
              fontFamily: "var(--fb)",
              fontSize: 14,
              marginBottom: 12,
            }}
          />
          <button
            type="button"
            className="cbtn green"
            style={{ width: "100%" }}
            onClick={saveEntry}
          >
            Save
          </button>
        </div>
      </div>

      <button
        type="button"
        className={`sheet-overlay${viewEntry ? " open" : ""}`}
        aria-label="Close entry"
        onClick={() => setViewEntry(null)}
      />
      <div
        className={`bottom-sheet-base${viewEntry ? " open" : ""}`}
        style={{
          maxHeight: "70vh",
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        }}
      >
        {viewEntry ? (
          <div style={{ padding: "16px 16px 8px" }}>
            <p style={{ fontSize: 12, color: "var(--text2)" }}>
              {formatDate(viewEntry.createdAt)}
            </p>
            {viewEntry.tag.trim() ? (
              <p style={{ marginTop: 6, fontSize: 13 }}>{viewEntry.tag}</p>
            ) : null}
            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <span
                  key={n}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background:
                      n <= viewEntry.mood
                        ? "var(--accent2)"
                        : "var(--surface2)",
                    border: "1px solid var(--border)",
                  }}
                />
              ))}
            </div>
            <p
              style={{
                marginTop: 14,
                fontSize: 14,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              {viewEntry.text}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                className="cbtn"
                style={{
                  flex: 1,
                  background: "var(--surface2)",
                  color: "var(--text)",
                }}
                onClick={() => openEdit(viewEntry)}
              >
                Edit
              </button>
              <button
                type="button"
                className="cbtn danger"
                style={{ flex: 1 }}
                onClick={() => setDeleteId(viewEntry.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className={`conf-ov${deleteId ? " open" : ""}`} role="presentation">
        <div className="conf-box">
          <p style={{ fontFamily: "var(--fb)", marginBottom: 8 }}>
            Delete this journal entry?
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="cbtn no"
              onClick={() => setDeleteId(null)}
            >
              Cancel
            </button>
            <button type="button" className="cbtn danger" onClick={deleteEntry}>
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
