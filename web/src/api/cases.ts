import { apiFetch } from "./client";
import type { Case, CaseCreate, CaseEvent, CaseUpdate } from "./types";

export const listCases = () => apiFetch<Case[]>("/cases");

export const createCase = (body: CaseCreate) =>
  apiFetch<Case>("/cases", { method: "POST", body: JSON.stringify(body) });

export const getCase = (id: number) => apiFetch<Case>(`/cases/${id}`);

export const updateCase = (id: number, body: CaseUpdate) =>
  apiFetch<Case>(`/cases/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deleteCase = (id: number) =>
  apiFetch<void>(`/cases/${id}`, { method: "DELETE" });

export const refreshCase = (id: number) =>
  apiFetch<Case>(`/cases/${id}/refresh`, { method: "POST" });

export const caseHistory = (id: number) => apiFetch<CaseEvent[]>(`/cases/${id}/history`);
