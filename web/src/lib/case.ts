import type { Case } from "../api/types";

/**
 * What to show as a case's heading. Falls back through nickname → form title →
 * receipt number, so an un-nicknamed case doesn't just repeat its receipt.
 */
export function caseTitle(c: Pick<Case, "nickname" | "form_title" | "receipt_number">): string {
  return c.nickname || c.form_title || c.receipt_number;
}

/** True when the heading already is the receipt number (so don't print it twice). */
export function titleIsReceipt(c: Pick<Case, "nickname" | "form_title" | "receipt_number">): boolean {
  return caseTitle(c) === c.receipt_number;
}
