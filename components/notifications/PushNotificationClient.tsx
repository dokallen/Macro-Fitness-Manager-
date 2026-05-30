"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const LS_DISMISSED = "mf_notificationsDismissed";
const LS_PUSH_ENABLED = "mf_pushEnabled";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function waitForServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function subscribeToPushNotifications(
  userId: string
): Promise<boolean> {
  if (!pushSupported()) return false;

  const keyRes = await fetch("/api/push-subscribe");
  if (!keyRes.ok) {
    toast.error("Push notifications are not configured yet.");
    return false;
  }
  const { publicKey } = (await keyRes.json()) as { publicKey?: string };
  if (!publicKey) {
    toast.error("Could not load push configuration.");
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    toast.error("Notification permission was denied.");
    return false;
  }

  const reg = await waitForServiceWorker();
  if (!reg) {
    toast.error("Service worker is not ready. Try again in a moment.");
    return false;
  }

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const res = await fetch("/api/push-subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userId,
      subscription: subscription.toJSON(),
      preferences: {
        notification_timezone: tz,
      },
    }),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    toast.error(data.error ?? "Could not save push subscription.");
    return false;
  }

  localStorage.setItem(LS_PUSH_ENABLED, "true");
  localStorage.removeItem(LS_DISMISSED);
  toast.success("🔔 Notifications enabled! Coach will keep you posted.");
  return true;
}

type Props = {
  userId: string;
};

export function PushNotificationClient({ userId }: Props) {
  const [supported] = useState(() => pushSupported());
  const [showBanner, setShowBanner] = useState(false);
  const [busy, setBusy] = useState(false);

  const checkSubscription = useCallback(async () => {
    if (!supported) return;
    if (localStorage.getItem(LS_DISMISSED) === "true") return;

    const reg = await waitForServiceWorker();
    if (!reg) return;

    const sub = await reg.pushManager.getSubscription();
    if (sub || localStorage.getItem(LS_PUSH_ENABLED) === "true") return;

    setShowBanner(true);
  }, [supported]);

  useEffect(() => {
    void checkSubscription();
  }, [checkSubscription]);

  if (!supported || !showBanner) return null;

  async function onEnable() {
    setBusy(true);
    const ok = await subscribeToPushNotifications(userId);
    setBusy(false);
    if (ok) setShowBanner(false);
  }

  function onDismiss() {
    localStorage.setItem(LS_DISMISSED, "true");
    setShowBanner(false);
  }

  return (
    <div
      style={{
        background: "var(--surface2)",
        borderBottom: "1px solid var(--border)",
        fontSize: 13,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexShrink: 0,
      }}
    >
      <span style={{ color: "var(--text)" }}>🔔 Enable Coach notifications?</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          className="cbtn yes"
          style={{ flex: "none", minWidth: 72, padding: "6px 12px" }}
          disabled={busy}
          onClick={() => void onEnable()}
        >
          Enable
        </button>
        <button
          type="button"
          style={{
            background: "none",
            border: "none",
            color: "var(--text3)",
            fontSize: 13,
            cursor: "pointer",
            padding: "6px 4px",
          }}
          disabled={busy}
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
