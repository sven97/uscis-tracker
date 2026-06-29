import { apiFetch } from "./client";
import type { Settings } from "./types";

export const getSettings = () => apiFetch<Settings>("/settings");

export const updateSettings = (body: Settings) =>
  apiFetch<Settings>("/settings", { method: "PUT", body: JSON.stringify(body) });

export const testNotification = () =>
  apiFetch<{ status: string }>("/settings/test", { method: "POST" });
