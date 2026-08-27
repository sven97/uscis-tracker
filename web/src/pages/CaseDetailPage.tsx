import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, RefreshCw, Trash2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  const [nickname, setNickname] = useState("");
  const [checking, setChecking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = async () => {
    try {
      const [detail, events] = await Promise.all([
        casesApi.getCase(caseId),
        casesApi.caseHistory(caseId),
      ]);
      setC(detail);
      setNickname(detail.nickname ?? "");
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

      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {c.nickname || c.receipt_number}
        </h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          {c.receipt_number}
          {c.form_title && `  ·  ${c.form_num} — ${c.form_title}`}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="relative overflow-hidden">
        <div className={cn("absolute inset-y-0 left-0 w-1", railClass(c.status))} />
        <CardContent className="space-y-3 pl-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge c={c} />
            <span className="font-mono text-xs text-muted-foreground">
              {c.last_checked ? `Checked ${fmt(c.last_checked)}` : "Not yet checked"}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={onRefresh}
              disabled={checking}
            >
              <RefreshCw className={cn(checking && "animate-spin")} />
              {checking ? "Checking…" : "Refresh now"}
            </Button>
          </div>
          {c.detail && (
            <div
              className="text-sm leading-relaxed text-muted-foreground [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2"
              dangerouslySetInnerHTML={{ __html: c.detail }}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4">
          <CardTitle>Settings</CardTitle>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1 space-y-1.5">
              <Label htmlFor="nickname">Nickname</Label>
              <Input
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => patch({ nickname: nickname.trim() || null })}
            >
              Save
            </Button>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm">Notify me when this case changes</span>
            <Switch
              checked={c.notify}
              onCheckedChange={(checked) => patch({ notify: checked })}
            />
          </div>
        </CardContent>
      </Card>

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

      <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
        <Trash2 />
        Stop tracking
      </Button>

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
