"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const LS_ITEMS = "mf_pantryItems";
const LS_CUSTOM = "mf_pantryCustom";

function loadItems(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LS_ITEMS);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return {};
    const o: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      o[k] = Boolean(v);
    }
    return o;
  } catch {
    return {};
  }
}

function loadCustom(): string[] {
  try {
    const raw = localStorage.getItem(LS_CUSTOM);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function saveItems(items: Record<string, boolean>) {
  localStorage.setItem(LS_ITEMS, JSON.stringify(items));
}

function saveCustom(custom: string[]) {
  localStorage.setItem(LS_CUSTOM, JSON.stringify(custom));
}

function parsePantryScanJson(text: string): string[] {
  const t = text.trim();
  const tryParse = (s: string) => {
    try {
      const v = JSON.parse(s) as unknown;
      if (!Array.isArray(v)) return null;
      return v.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      return null;
    }
  };
  const direct = tryParse(t);
  if (direct) return direct;
  const fence = t.match(/\[[\s\S]*\]/);
  if (fence) {
    const inner = tryParse(fence[0]);
    if (inner) return inner;
  }
  return [];
}

export function PantryClient() {
  const [items, setItems] = useState<Record<string, boolean>>({});
  const [custom, setCustom] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [scanning, setScanning] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detected, setDetected] = useState<string[]>([]);
  const [selectedDetect, setSelectedDetect] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const hydrate = useCallback(() => {
    setItems(loadItems());
    setCustom(loadCustom());
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const { haveCount, needCount, onHandLabel } = useMemo(() => {
    let h = 0;
    let n = 0;
    for (const name of custom) {
      if (items[name]) h++;
      else n++;
    }
    return { haveCount: h, needCount: n, onHandLabel: h };
  }, [custom, items]);

  function persist(nextItems: Record<string, boolean>, nextCustom: string[]) {
    setItems(nextItems);
    setCustom(nextCustom);
    saveItems(nextItems);
    saveCustom(nextCustom);
  }

  function toggleHave(name: string) {
    const next = { ...items, [name]: !items[name] };
    persist(next, custom);
  }

  function addItem() {
    const name = draft.trim();
    if (!name) return;
    if (custom.includes(name)) {
      toast.error("Already in pantry.");
      return;
    }
    const nextCustom = [...custom, name];
    const nextItems = { ...items, [name]: false };
    persist(nextItems, nextCustom);
    setDraft("");
    toast.success(`Added ${name} to pantry`);
  }

  function removeItem(name: string) {
    const nextCustom = custom.filter((x) => x !== name);
    const nextItems = { ...items };
    delete nextItems[name];
    persist(nextItems, nextCustom);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    setScanning(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) {
        setScanning(false);
        toast.error("Could not read image.");
        return;
      }
      try {
        const res = await fetch("/api/coach-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pantryScan: true,
            imageBase64: dataUrl,
            max_tokens: 1000,
          }),
        });
        const data = (await res.json()) as { error?: string; pantryScanReply?: string };
        if (!res.ok || !data.pantryScanReply) {
          toast.error("Could not scan photo. Try better lighting or a clearer angle.");
          setScanning(false);
          return;
        }
        const list = parsePantryScanJson(data.pantryScanReply);
        if (list.length === 0) {
          toast.error("Could not scan photo. Try better lighting or a clearer angle.");
          setScanning(false);
          return;
        }
        const sel: Record<string, boolean> = {};
        for (const x of list) sel[x] = true;
        setDetected(list);
        setSelectedDetect(sel);
        setSheetOpen(true);
      } catch {
        toast.error("Could not scan photo. Try better lighting or a clearer angle.");
      } finally {
        setScanning(false);
      }
    };
    reader.onerror = () => {
      setScanning(false);
      toast.error("Could not read image.");
    };
    reader.readAsDataURL(file);
  }

  function confirmScanAdd() {
    const toAdd = detected.filter((n) => selectedDetect[n]);
    if (toAdd.length === 0) {
      setSheetOpen(false);
      return;
    }
    const nextCustom = [...custom];
    const nextItems = { ...items };
    for (const name of toAdd) {
      if (!nextCustom.includes(name)) {
        nextCustom.push(name);
        nextItems[name] = false;
      }
    }
    persist(nextItems, nextCustom);
    setSheetOpen(false);
    setDetected([]);
    setSelectedDetect({});
    toast.success(`${toAdd.length} items added to your pantry`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--bg)] pb-24">
      <header className="ph shrink-0">
        <Link href="/" className="back-btn">
          ← Back
        </Link>
        <h1 className="pt">PANTRY</h1>
        <p className="ps">{onHandLabel} items on hand</p>
      </header>

      <p className="px-4 pb-2 text-center text-xs text-[var(--text3)]">
        {haveCount} have · {needCount} need
      </p>

      <div className="px-4 pb-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onFileChange}
        />
        <button
          type="button"
          className="upload-area w-full max-w-none border-none"
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
        >
          {scanning ? (
            <p className="text-sm text-[var(--text)]">🧠 Scanning your pantry…</p>
          ) : (
            <>
              <div className="text-4xl" aria-hidden>
                📸
              </div>
              <p className="mt-2 font-semibold text-[var(--text)]">Scan Your Pantry</p>
              <p className="mt-1 text-xs text-[var(--text2)]">
                Take a photo of your fridge or shelves — AI will detect what&apos;s there
              </p>
            </>
          )}
        </button>
      </div>

      <div className="px-4">
        {custom.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text2)]">
            Your pantry is empty. Add items below to track what you have on hand.
          </p>
        ) : (
          <ul className="list-none p-0">
            {custom.map((name) => {
              const have = Boolean(items[name]);
              return (
                <li
                  key={name}
                  className={`pantry-item${have ? " have" : ""}`}
                  onClick={() => toggleHave(name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleHave(name);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <span className="pantry-chk" aria-hidden>
                    {have ? "✓" : ""}
                  </span>
                  <span className="flex-1 text-sm text-[var(--text)]">{name}</span>
                  <button
                    type="button"
                    className="shrink-0 border-none bg-transparent px-2 text-lg text-[var(--text2)] hover:text-[var(--text)]"
                    aria-label={`Remove ${name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeItem(name);
                    }}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 flex gap-2 border-t border-[var(--border)] bg-[var(--bg)] p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <input
          className="chat-inp min-w-0 flex-1"
          placeholder="Add item to pantry..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addItem();
          }}
        />
        <button
          type="button"
          className="shrink-0 rounded-[10px] px-4 py-2 font-semibold text-white"
          style={{ background: "var(--accent2)" }}
          onClick={addItem}
        >
          + Add
        </button>
      </div>

      <button
        type="button"
        className={`sheet-overlay${sheetOpen ? " open" : ""}`}
        aria-label="Close"
        onClick={() => setSheetOpen(false)}
      />
      <div className={`bottom-sheet-base${sheetOpen ? " open" : ""}`}>
        <div className="p-4 pb-8">
          <p className="pantry-sec-hdr" style={{ fontFamily: "var(--fd)", letterSpacing: 2 }}>
            DETECTED ITEMS
          </p>
          <p className="mb-3 text-xs text-[var(--text2)]">
            {detected.length} items found — select which ones to add
          </p>
          <ul className="max-h-[45vh] space-y-2 overflow-y-auto">
            {detected.map((n) => (
              <li key={n} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={Boolean(selectedDetect[n])}
                  onChange={(e) =>
                    setSelectedDetect((s) => ({ ...s, [n]: e.target.checked }))
                  }
                />
                <span className="text-sm text-[var(--text)]">{n}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              className="cbtn green w-full"
              onClick={confirmScanAdd}
            >
              Add Selected to Pantry
            </button>
            <button
              type="button"
              className="cbtn no w-full"
              onClick={() => setSheetOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
