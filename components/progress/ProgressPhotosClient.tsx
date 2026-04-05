"use client";

import { useCallback, useEffect, useState } from "react";

type Photo = {
  id: string;
  date: string;
  note: string;
  dataUrl: string;
  locked: boolean;
};

const LS_PHOTOS = "mf_progressPhotos";
const LS_PIN = "mf_progressPhotoPin";

function loadPhotos(): Photo[] {
  try {
    const raw = localStorage.getItem(LS_PHOTOS);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p
      .map((x) => {
        if (!x || typeof x !== "object") return null;
        const o = x as Record<string, unknown>;
        const id = String(o.id ?? "");
        const date = String(o.date ?? "");
        const note = String(o.note ?? "");
        const dataUrl = String(o.dataUrl ?? "");
        const locked = Boolean(o.locked);
        if (!id || !dataUrl) return null;
        return { id, date, note, dataUrl, locked };
      })
      .filter(Boolean) as Photo[];
  } catch {
    return [];
  }
}

function savePhotos(list: Photo[]) {
  localStorage.setItem(LS_PHOTOS, JSON.stringify(list));
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readPin(): string | null {
  const p = localStorage.getItem(LS_PIN);
  return p && /^\d{4}$/.test(p) ? p : null;
}

export function ProgressPhotosClient() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [storedPin, setStoredPin] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(true);
  const [setupOpen, setSetupOpen] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinEntry, setPinEntry] = useState("");
  const [pinError, setPinError] = useState("");
  const [viewer, setViewer] = useState<Photo | null>(null);

  const hydrate = useCallback(() => {
    setPhotos(loadPhotos());
    const pin = readPin();
    setStoredPin(pin);
    setUnlocked(!pin);
    setSetupOpen(false);
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) return;
      const id = crypto.randomUUID();
      const p: Photo = {
        id,
        date: todayYmd(),
        note: "",
        dataUrl,
        locked: false,
      };
      savePhotos([...loadPhotos(), p]);
      setPhotos(loadPhotos());
    };
    reader.readAsDataURL(file);
  }

  function updateNote(id: string, note: string) {
    setPhotos((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, note } : p));
      savePhotos(next);
      return next;
    });
  }

  function tryUnlock() {
    setPinError("");
    if (pinEntry.length !== 4) {
      setPinError("Enter 4 digits.");
      return;
    }
    if (pinEntry !== storedPin) {
      setPinError("Wrong PIN.");
      return;
    }
    setUnlocked(true);
    setPinEntry("");
  }

  function saveNewPin() {
    setPinError("");
    if (!/^\d{4}$/.test(pinInput) || !/^\d{4}$/.test(pinConfirm)) {
      setPinError("PIN must be 4 digits.");
      return;
    }
    if (pinInput !== pinConfirm) {
      setPinError("PINs do not match.");
      return;
    }
    localStorage.setItem(LS_PIN, pinInput);
    setStoredPin(pinInput);
    setUnlocked(true);
    setSetupOpen(false);
    setPinInput("");
    setPinConfirm("");
  }

  function clearPin() {
    localStorage.removeItem(LS_PIN);
    setStoredPin(null);
    setUnlocked(true);
    setSetupOpen(false);
  }

  const lockActive = Boolean(storedPin);
  const showPhotos = !lockActive || unlocked;

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-10 pt-6 sm:max-w-2xl">
      <h2 className="mb-3 font-[family-name:var(--fd)] text-sm uppercase tracking-[0.2em] text-[var(--accent3)]">
        📸 PROGRESS PHOTOS
      </h2>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text2)]">
          <input
            type="checkbox"
            checked={lockActive || setupOpen}
            onChange={(e) => {
              if (e.target.checked) {
                setSetupOpen(true);
                setPinError("");
              } else {
                setSetupOpen(false);
                clearPin();
              }
            }}
          />
          Lock this section with a PIN
        </label>
        {lockActive ? (
          <button
            type="button"
            className="text-xs text-[var(--accent)] underline"
            onClick={() => setSetupOpen(true)}
          >
            Change PIN
          </button>
        ) : null}
      </div>

      {setupOpen && !lockActive ? (
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
          <p className="mb-2 text-[var(--text)]">Choose a 4-digit PIN</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            className="inf mb-2"
            placeholder="PIN"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            className="inf mb-2"
            placeholder="Confirm PIN"
            value={pinConfirm}
            onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
          {pinError ? <p className="mb-2 text-xs text-red-400">{pinError}</p> : null}
          <div className="flex gap-2">
            <button type="button" className="cbtn yes flex-1" onClick={saveNewPin}>
              Save PIN
            </button>
            <button
              type="button"
              className="cbtn no flex-1"
              onClick={() => {
                setSetupOpen(false);
                setPinError("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {setupOpen && lockActive ? (
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
          <p className="mb-2 text-[var(--text)]">New 4-digit PIN</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            className="inf mb-2"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            className="inf mb-2"
            value={pinConfirm}
            onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
          {pinError ? <p className="mb-2 text-xs text-red-400">{pinError}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              className="cbtn yes flex-1"
              onClick={() => {
                if (pinInput === pinConfirm && /^\d{4}$/.test(pinInput)) {
                  localStorage.setItem(LS_PIN, pinInput);
                  setStoredPin(pinInput);
                  setSetupOpen(false);
                  setPinInput("");
                  setPinConfirm("");
                  setPinError("");
                } else {
                  setPinError("PINs must match (4 digits).");
                }
              }}
            >
              Update PIN
            </button>
            <button
              type="button"
              className="cbtn no flex-1"
              onClick={() => {
                setSetupOpen(false);
                setPinError("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {lockActive && !unlocked ? (
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
          <p className="text-2xl" aria-hidden>
            🔒
          </p>
          <p className="mt-2 text-sm text-[var(--text2)]">Enter PIN to view</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            className="inf mx-auto mt-3 max-w-[200px] text-center"
            value={pinEntry}
            onChange={(e) => setPinEntry(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
          {pinError ? <p className="mt-2 text-xs text-red-400">{pinError}</p> : null}
          <button type="button" className="cbtn yes mx-auto mt-3 block w-full max-w-[200px]" onClick={tryUnlock}>
            Unlock
          </button>
        </div>
      ) : null}

      {showPhotos ? (
        <>
          <label className="upload-area mb-4 block cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={onPickImage} />
            <span className="text-sm font-semibold text-[var(--text)]">Add Photo</span>
          </label>

          {photos.length === 0 ? (
            <p className="text-center text-xs text-[var(--text2)]">No photos yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {photos.map((p) => (
                <div key={p.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2">
                  <button
                    type="button"
                    className="block w-full overflow-hidden rounded-lg"
                    onClick={() => setViewer(p)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.dataUrl} alt="" className="h-32 w-full object-cover" />
                  </button>
                  <p className="mt-1 text-[10px] text-[var(--text3)]">{p.date}</p>
                  <input
                    className="inf mt-1 text-xs"
                    placeholder="Note (optional)"
                    value={p.note}
                    onChange={(e) => updateNote(p.id, e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}

      {viewer ? (
        <div
          className="conf-ov open"
          role="dialog"
          aria-modal
          onClick={() => setViewer(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setViewer(null);
          }}
        >
          <div
            className="conf-box max-h-[90vh] max-w-lg overflow-auto"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewer.dataUrl} alt="" className="max-h-[70vh] w-full object-contain" />
            <p className="mt-2 text-center text-xs text-[var(--text2)]">{viewer.date}</p>
            <button type="button" className="cbtn no mx-auto mt-3 block w-full" onClick={() => setViewer(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
