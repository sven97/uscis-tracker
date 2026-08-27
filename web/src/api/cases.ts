import { apiFetch } from "./client";
import type { Case, CaseCreate, CaseEvent, CasePreview, CaseUpdate } from "./types";

export const listCases = () => apiFetch<Case[]>("/cases");

/** Look up a receipt's current status without adding it to the tracking list. */
export const previewCase = (receipt_number: string) =>
  apiFetch<CasePreview>("/cases/preview", {
    method: "POST",
    body: JSON.stringify({ receipt_number }),
  });

export const createCase = (body: CaseCreate) =>
  apiFetch<Case>("/cases", { method: "POST", body: JSON.stringify(body) });

export const getCase = (id: number) => apiFetch<Case>(`/cases/${id}`);

export const updateCase = (id: number, body: CaseUpdate) =>
  apiFetch<Case>(`/cases/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const setArchived = (id: number, archived: boolean) =>
  updateCase(id, { archived });

export const deleteCase = (id: number) =>
  apiFetch<void>(`/cases/${id}`, { method: "DELETE" });

export const refreshCase = (id: number) =>
  apiFetch<Case>(`/cases/${id}/refresh`, { method: "POST" });

export const caseHistory = (id: number) => apiFetch<CaseEvent[]>(`/cases/${id}/history`);
