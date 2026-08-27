import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, LoaderCircle, Plus } from "lucide-react";
import * as casesApi from "../api/cases";
import { ApiError, type Case, type CasePreview } from "../api/types";
import { StatusPill } from "./StatusBadge";
import { Button } from "@/components/animate-ui/components/buttons/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RECEIPT_RE = /^[A-Za-z]{3}\d{10}$/;

function message(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

export function AddCaseDialog({ onAdded }: { onAdded: (created: Case) => void }) {
  const [open, setOpenState] = useState(false);
  const [step, setStep] = useState<"lookup" | "confirm">("lookup");
  const [receipt, setReceipt] = useState("");
  const [preview, setPreview] = useState<CasePreview | null>(null);
  const [nickname, setNickname] = useState("");
  const [looking, setLooking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setOpen = (v: boolean) => {
    setOpenState(v);
    if (!v) {
      setStep("lookup");
      setReceipt("");
      setPreview(null);
      setNickname("");
      setError(null);
      setLooking(false);
      setAdding(false);
    }
  };

  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    const r = receipt.trim().toUpperCase();
    if (!RECEIPT_RE.test(r)) {
      setError("Enter a valid receipt number — 3 letters followed by 10 digits.");
      return;
    }
    setLooking(true);
    setError(null);
    try {
      const p = await casesApi.previewCase(r);
      setPreview(p);
      setNickname("");
      setStep("confirm");
    } catch (err) {
      setError(message(err, "Couldn't look up that receipt number."));
    } finally {
      setLooking(false);
    }
  };

  const add = async () => {
    if (!preview) return;
    setAdding(true);
    setError(null);
    try {
      const created = await casesApi.createCase({
        receipt_number: preview.receipt_number,
        nickname: nickname.trim() || null,
      });
      onAdded(created);
      setOpen(false);
    } catch (err) {
      setError(message(err, "Couldn't add that case."));
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {createPortal(
        <Button
          onClick={() => setOpen(true)}
          aria-label="Track a new case"
          className="fixed right-5 bottom-6 z-40 size-14 rounded-full p-0 shadow-lg"
        >
          <Plus className="size-6" />
        </Button>,
        document.body,
      )}

      <DialogContent>
        {step === "lookup" ? (
          <form onSubmit={lookup} className="contents">
            <DialogHeader>
              <DialogTitle>Track a new case</DialogTitle>
              <DialogDescription>
                Enter a USCIS receipt number to look up its current status.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="add-receipt">Receipt number</Label>
              <Input
                id="add-receipt"
                autoFocus
                className="font-mono tracking-wider"
                placeholder="IOE1234567890"
                value={receipt}
                onChange={(e) => {
                  setReceipt(e.target.value.toUpperCase());
                  setError(null);
                }}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={looking || !RECEIPT_RE.test(receipt.trim())}>
                {looking ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Looking up…
                  </>
                ) : (
                  "Look up status"
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          preview && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Back"
                    onClick={() => {
                      setStep("lookup");
                      setError(null);
                    }}
                    className="-ml-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ArrowLeft className="size-4" />
                  </button>
                  <DialogTitle>Add this case?</DialogTitle>
                </div>
                <DialogDescription>
                  Found a case for {preview.receipt_number}.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
                <StatusPill status={preview.status} finished={preview.is_finished} />
                {(preview.form_num || preview.form_title) && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {preview.form_num && (
                      <span className="rounded border bg-background px-1.5 py-0.5 font-mono text-[0.65rem] font-medium text-muted-foreground">
                        {preview.form_num}
                      </span>
                    )}
                    {preview.form_title && (
                      <span className="text-xs text-muted-foreground">{preview.form_title}</span>
                    )}
                  </div>
                )}
                <div className="font-mono text-xs tracking-wider text-muted-foreground">
                  {preview.receipt_number}
                </div>
                {preview.detail && (
                  <p
                    className="line-clamp-3 text-xs leading-relaxed text-muted-foreground [&_a]:underline"
                    dangerouslySetInnerHTML={{ __html: preview.detail }}
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="add-nick">Nickname — optional</Label>
                <Input
                  id="add-nick"
                  autoFocus
                  placeholder={preview.form_title || preview.receipt_number}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Helps tell cases apart. Left blank, the list shows the form name.
                </p>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Close
                </Button>
                <Button type="button" onClick={add} disabled={adding}>
                  {adding ? (
                    <>
                      <LoaderCircle className="animate-spin" />
                      Adding…
                    </>
                  ) : (
                    <>
                      <Plus />
                      Add to tracking list
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
