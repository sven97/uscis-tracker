import type { Case } from "../api/types";

type Tone = "green" | "amber" | "rust" | "slate" | "none";

export function statusTone(status: string | null): Tone {
  if (!status) return "none";
  const s = status.toLowerCase();
  if (s.includes("approved") || s.includes("delivered") || s.includes("produced")) return "green";
  if (s.includes("denied") || s.includes("rejected") || s.includes("closed")) return "rust";
  if (
    s.includes("scheduled") ||
    s.includes("biometrics") ||
    s.includes("interview") ||
    s.includes("evidence") ||
    s.includes("rfe") ||
    s.includes("mailed") ||
    s.includes("pick")
  )
    return "amber";
  if (s.includes("received") || s.includes("accepted")) return "slate";
  return "green";
}

/** The rail/accent color a case uses (CSS var value) based on its status. */
export function railColor(status: string | null): string {
  const tone = statusTone(status);
  return {
    green: "var(--green)",
    amber: "var(--amber)",
    rust: "var(--rust)",
    slate: "var(--slate)",
    none: "var(--line-strong)",
  }[tone];
}

export function StatusBadge({ c }: { c: Case }) {
  const tone = statusTone(c.status);
  const done = c.is_finished;
  return (
    <span className={`stamp tone-${tone}${done ? " done" : ""}`}>
      {done && "✓ "}
      {c.status ?? "Pending"}
    </span>
  );
}
