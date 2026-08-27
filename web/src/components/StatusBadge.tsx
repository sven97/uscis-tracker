import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Case } from "../api/types";

export type Tone = "green" | "amber" | "rust" | "slate" | "none";

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

/* Full class strings so Tailwind's scanner keeps them. */
const TONE: Record<Tone, { badge: string; rail: string }> = {
  green: {
    badge: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
    rail: "bg-emerald-500",
  },
  amber: {
    badge: "bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/25",
    rail: "bg-amber-500",
  },
  rust: {
    badge: "bg-red-500/12 text-red-700 dark:text-red-400 border-red-500/25",
    rail: "bg-red-500",
  },
  slate: {
    badge: "bg-sky-500/12 text-sky-700 dark:text-sky-400 border-sky-500/25",
    rail: "bg-sky-500",
  },
  none: {
    badge: "bg-muted text-muted-foreground border-border",
    rail: "bg-muted-foreground/40",
  },
};

/** Tailwind bg-* class for a case's left accent rail. */
export function railClass(status: string | null): string {
  return TONE[statusTone(status)].rail;
}

export function StatusBadge({ c, className }: { c: Case; className?: string }) {
  const tone = statusTone(c.status);
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-auto whitespace-normal border px-2 py-1 text-[0.7rem] leading-tight font-semibold tracking-wide uppercase",
        TONE[tone].badge,
        className,
      )}
    >
      {c.is_finished ? `✓ ${c.status ?? "Pending"}` : (c.status ?? "Pending")}
    </Badge>
  );
}
