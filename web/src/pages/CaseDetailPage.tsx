import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  Clock,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import * as casesApi from "../api/cases";
import { pollUntilChecked } from "../api/poll";
import { ApiError, type Case, type CaseEvent, type CaseUpdate } from "../api/types";
import { railClass, StatusBadge } from "../components/StatusBadge";
import { Button, buttonVariants } from "@/components/animate-ui/components/buttons/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { caseTitle, titleIsReceipt } from "@/lib/case";
import { cn } from "@/lib/utils";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });

export function CaseDetailPage() {
  const { id = "" } = useParams();
  const caseId = Number(id);
  const navigate = useNavigate();
  const [c, setC] = useState<Case | null>(null);
  const [history, setHistory] = useState<CaseEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const load = async () => {
    try {
      const [detail, events] = await Promise.all([
        casesApi.getCase(caseId),
        casesApi.caseHistory(caseId),
      ]);
      setC(detail);
      setHistory(events);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load case");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const patch = async (body: CaseUpdate) => {
    try {
      setC(await casesApi.updateCase(caseId, body));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    }
  };

  const saveName = async () => {
    await patch({ nickname: nameDraft.trim() || null });
    setEditingName(false);
  };

  const archive = async (archived: boolean) => {
    await patch({ archived });
    if (archived) navigate("/");
  };

  const onRefresh = async () => {
    const since = c?.last_checked ?? null;
    setChecking(true);
    try {
      await casesApi.refreshCase(caseId);
      await pollUntilChecked(caseId, since, setC);
      setHistory(await casesApi.caseHistory(caseId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Refresh failed");
    } finally {
      setChecking(false);
    }
  };

  const onDelete = async () => {
    try {
      await casesApi.deleteCase(caseId);
      navigate("/");
    } catch (err) {
      setConfirmOpen(false);
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  };

  if (error && !c) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!c) return <p className="py-14 text-center text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-3")}
      >
        <ArrowLeft />
        All cases
      </Link>

      {/* Header — title + inline nickname edit */}
      <div className="space-y-1.5">
        {editingName ? (
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={nameDraft}
              placeholder={c.form_title || c.receipt_number}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") setEditingName(false);
              }}
              className="h-9 max-w-xs font-heading text-lg"
            />
            <Button size="icon-sm" variant="ghost" onClick={saveName} aria-label="Save name">
              <Check />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setEditingName(false)}
              aria-label="Cancel"
            >
              <X />
            </Button>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{caseTitle(c)}</h1>
            <Button
              size="icon-sm"
              variant="ghost"
              className="mt-1 shrink-0 text-muted-foreground"
              aria-label="Edit name"
              onClick={() => {
                setNameDraft(c.nickname ?? "");
                setEditingName(true);
              }}
            >
              <Pencil className="size-4" />
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {c.form_num && (
            <span className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] font-medium">
              {c.form_num}
            </span>
          )}
          {c.form_title && caseTitle(c) !== c.form_title && <span>{c.form_title}</span>}
          {!titleIsReceipt(c) && <span className="font-mono text-xs">{c.receipt_number}</span>}
          {c.archived && (
            <span className="rounded-full border px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide">
              Archived
            </span>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Current status */}
      <Card className="relative overflow-hidden">
        <div className={cn("absolute inset-y-0 left-0 w-1", railClass(c.status))} />
        <CardContent className="space-y-3 pl-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <StatusBadge c={c} />
            <Button size="sm" variant="outline" onClick={onRefresh} disabled={checking}>
              <RefreshCw className={cn(checking && "animate-spin")} />
              {checking ? "Checking…" : "Refresh"}
            </Button>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            {c.last_checked ? `Checked ${fmt(c.last_checked)}` : "Not yet checked"}
          </div>
          {c.detail && (
            <div
              className="text-sm leading-relaxed text-muted-foreground [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2"
              dangerouslySetInnerHTML={{ __html: c.detail }}
            />
          )}
          {c.is_finished && !c.archived && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
              <span>This status looks final. Archive it when you're done.</span>
              <Button size="sm" variant="ghost" onClick={() => archive(true)}>
                <Archive className="size-3.5" />
                Archive
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notifications */}
      <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
        <div className="flex items-center gap-3">
          {c.notify ? (
            <Bell className="size-4 text-muted-foreground" />
          ) : (
            <BellOff className="size-4 text-muted-foreground" />
          )}
          <div>
            <div className="text-sm font-medium">Notifications</div>
            <div className="text-xs text-muted-foreground">
              {c.notify
                ? "Alerts you when this case's status changes."
                : "Muted — no alerts for this case."}
            </div>
          </div>
        </div>
        <Switch checked={c.notify} onCheckedChange={(v) => patch({ notify: v })} />
      </div>

      {/* History */}
      <Card>
        <CardContent className="space-y-4">
          <CardTitle>History</CardTitle>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No status changes recorded yet.</p>
          ) : (
            <ol className="relative space-y-6 border-l pl-6">
              {history.map((e, i) => (
                <motion.li
                  key={i}
                  className="relative"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.2 }}
                >
                  <span
                    className={cn(
                      "absolute top-1 -left-[27px] size-3 rounded-full ring-4 ring-card",
                      railClass(e.action_code_text),
                    )}
                  />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="font-heading font-medium">
                      {e.action_code_text}
                      <span className="ml-2 rounded border px-1 py-0.5 font-mono text-[0.6rem] uppercase text-muted-foreground">
                        {e.source}
                      </span>
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {fmt(e.recorded_at)}
                    </span>
                  </div>
                  {e.action_code_desc && (
                    <p
                      className="mt-1 text-sm leading-relaxed text-muted-foreground [&_a]:underline [&_a]:underline-offset-2"
                      dangerouslySetInnerHTML={{ __html: e.action_code_desc }}
                    />
                  )}
                </motion.li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {c.archived ? (
          <Button variant="outline" onClick={() => archive(false)}>
            <ArchiveRestore />
            Restore to tracking
          </Button>
        ) : (
          <Button variant="outline" onClick={() => archive(true)}>
            <Archive />
            Archive
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => setConfirmOpen(true)}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 />
          Stop tracking
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop tracking this case?</AlertDialogTitle>
            <AlertDialogDescription>
              The tracker will stop checking {c.receipt_number} and remove it from your list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDelete}>
              Stop tracking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
