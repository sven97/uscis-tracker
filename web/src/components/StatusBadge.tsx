import type { Case } from "../api/types";

export function statusTone(status: string | null): "green" | "red" | "blue" | "" {
  if (!status) return "";
  const s = status.toLowerCase();
  if (s.includes("approved") || s.includes("delivered")) return "green";
  if (s.includes("denied") || s.includes("rejected")) return "red";
  if (s.includes("received")) return "blue";
  return "";
}

export function StatusBadge({ c }: { c: Case }) {
  return (
    <span className={`badge ${statusTone(c.status)}`}>
      {c.status ?? "Pending first check"}
    </span>
  );
}
