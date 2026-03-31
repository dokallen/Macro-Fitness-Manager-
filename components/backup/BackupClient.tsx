"use client";

import { useCallback, useState } from "react";

import { SubpageHeader } from "@/components/layout/SubpageHeader";

const PREFIX = "mf_";

function collectMfData(): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) {
      out[k] = localStorage.getItem(k);
    }
  }
  return out;
}

function applyMfData(data: Record<string, string>) {
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith(PREFIX) && typeof v === "string") {
      localStorage.setItem(k, v);
    }
  }
}

export function BackupClient() {
  const [status, setStatus] = useState<string | null>(null);

  const exportJson = useCallback(() => {
    const payload = collectMfData();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `macro-fit-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Exported mf_* keys to a JSON file.");
  }, []);

  const importFile = useCallback((file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const parsed = JSON.parse(text) as unknown;
        if (typeof parsed !== "object" || parsed === null) {
          setStatus("Invalid file.");
          return;
        }
        applyMfData(parsed as Record<string, string>);
        setStatus("Restored mf_* keys from file.");
      } catch {
        setStatus("Could not read backup file.");
      }
    };
    reader.readAsText(file);
  }, []);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-24">
      <SubpageHeader title="BACKUP & RESTORE" subtitle="Local mf_* data" />
      <div
        className="px-4"
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        <p style={{ fontSize: 14, color: "var(--text2)", fontFamily: "var(--fb)" }}>
          Export or import browser data stored under keys starting with{" "}
          <code style={{ color: "var(--accent)" }}>mf_</code> (supplements, journal,
          badges, etc.).
        </p>
        <button type="button" className="cbtn green" onClick={exportJson}>
          Export backup
        </button>
        <label
          style={{
            display: "block",
            padding: "12px 16px",
            border: "2px dashed var(--border)",
            borderRadius: 12,
            textAlign: "center",
            cursor: "pointer",
            fontFamily: "var(--fb)",
            fontSize: 14,
            color: "var(--accent)",
          }}
        >
          Import backup JSON
          <input
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => void importFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {status ? (
          <p style={{ fontSize: 13, color: "var(--text2)" }}>{status}</p>
        ) : null}
      </div>
    </div>
  );
}
