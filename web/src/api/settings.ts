import { apiFetch } from "./client";
import type { Settings } from "./types";

export const getSettings = () => apiFetch<Settings>("/settings");

/** Partial update — send only the section you changed. */
export const updateSettings = (body: Partial<Settings>) =>
  apiFetch<Settings>("/settings", { method: "PUT", body: JSON.stringify(body) });

/** Test one Apprise URL (even if unsaved), or every configured channel when omitted. */
export const testNotification = (url?: string) =>
  apiFetch<{ status: string }>("/settings/test", {
    method: "POST",
    body: JSON.stringify(url ? { url } : {}),
  });
