import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Archive, ArchiveRestore, RefreshCw, TriangleAlert } from "lucide-react";
import * as casesApi from "../api/cases";
import { pollUntilChecked } from "../api/poll";
import { ApiError, type Case } from "../api/types";
import { railClass, StatusBadge } from "../components/StatusBadge";
import { AddCaseDialog } from "../components/AddCaseDialog";
import { Button } from "@/components/animate-ui/components/buttons/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { caseTitle, titleIsReceipt } from "@/lib/case";
import { usePullToRefresh } from "@/lib/use-pull-to-refresh";
import { cn } from "@/lib/utils";

type Filter = "tracking" | "archived";

function lastChecked(iso: string | null): string {
  if (!iso) return "Never checked";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "Checked just now";
  if (mins < 60) return `Checked ${mins}m ago`;
  if (mins < 1440) return `Checked ${Math.round(mins / 60)}h ago`;
  return `Checked ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function CasesPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [filter, setFilter] = useState<Filter>("tracking");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState<Set<number>>(new Set());

  const setChecker = (id: number, on: boolean) =>
    setChecking((s) => {
      const n = new Set(s);
      on ? n.add(id) : n.delete(id);
      return n;
    });
  const replaceCase = (c: Case) => setCases((cs) => cs.map((x) => (x.id === c.id ? c : x)));

  const load = async () => {
    setLoading(true);
    try {
      setCases(await casesApi.listCases());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load cases");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onAdded = (created: Case) => {
    setCases((cs) => [created, ...cs.filter((c) => c.id !== created.id)]);
    setChecker(created.id, true);
    pollUntilChecked(created.id, created.last_checked, replaceCase).finally(() =>
      setChecker(created.id, false),
    );
  };

  const onRefresh = async (id: number) => {
    const since = cases.find((c) => c.id === id)?.last_checked ?? null;
    setChecker(id, true);
    try {
      await casesApi.refreshCase(id);
      await pollUntilChecked(id, since, replaceCase);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Refresh failed");
    } finally {
      setChecker(id, false);
    }
  };

  const onArchive = async (id: number, archived: boolean) => {
    try {
      replaceCase(await casesApi.setArchived(id, archived));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update the case");
    }
  };

  // Pull-to-refresh: reload the list, then kick a USCIS check on every
  // non-archived case (per-card "Checking…" spinners take it from there).
  const refreshAll = async () => {
    let list: Case[];
    try {
      list = await casesApi.listCases();
      setCases(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load cases");
      return;
    }
    const targets = list.filter((c) => !c.archived);
    targets.forEach((c) => setChecker(c.id, true));
    targets.forEach((c) => {
      casesApi
        .refreshCase(c.id)
        .then(() => pollUntilChecked(c.id, c.last_checked, replaceCase))
        .catch(() => setError("Some cases couldn't be refreshed"))
        .finally(() => setChecker(c.id, false));
    });
  };

  const { pull, refreshing, threshold } = usePullToRefresh(refreshAll);

  const shown = cases.filter((c) => (filter === "archived" ? c.archived : !c.archived));

  const settle = refreshing || pull === 0;

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center"
        style={{
          transform: `translateY(${Math.max(pull - 44, -44)}px)`,
          opacity: pull > 6 || refreshing ? 1 : 0,
          transition: settle ? "transform .2s ease, opacity .2s ease" : "none",
        }}
      >
        <div className="mt-3 rounded-full border bg-card p-2 shadow-md">
          <RefreshCw
            className={cn("size-5 text-muted-foreground", refreshing && "animate-spin")}
            style={refreshing ? undefined : { transform: `rotate(${(pull / threshold) * 300}deg)` }}
          />
        </div>
      </div>

      <div
        className="space-y-4"
        style={{
          transform: `translateY(${pull}px)`,
          transition: settle ? "transform .2s ease" : "none",
        }}
      >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList variant="line">
            <TabsTrigger value="tracking">Tracking</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
        </Tabs>
        <AddCaseDialog onAdded={onAdded} />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <p className="py-14 text-center text-muted-foreground">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="py-14 text-center text-muted-foreground">
          {cases.length === 0
            ? 'No cases yet. Use "Track a case" to look up a receipt number.'
            : filter === "archived"
              ? "Nothing archived. Archive a case once you're done watching it."
              : "Nothing being tracked."}
        </p>
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {shown.map((c) => (
              <motion.li
                key={c.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.18 }}
              >
                <Card className="relative overflow-hidden">
                  <div className={cn("absolute inset-y-0 left-0 w-1", railClass(c.status))} />
                  <CardContent className="flex flex-col gap-2.5 pl-5">
                    <StatusBadge c={c} />
                    <div>
                      <Link
                        to={`/cases/${c.id}`}
                        className="font-heading text-lg font-medium hover:underline"
                      >
                        {caseTitle(c)}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        {c.form_num && (
                          <span className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] font-medium">
                            {c.form_num}
                          </span>
                        )}
                        {c.form_title && caseTitle(c) !== c.form_title && (
                          <span>{c.form_title}</span>
                        )}
                      </div>
                      {!titleIsReceipt(c) && (
                        <div className="mt-0.5 font-mono text-xs tracking-wider text-muted-foreground">
                          {c.receipt_number}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-0.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-[0.7rem] text-muted-foreground">
                          {lastChecked(c.last_checked)}
                        </span>
                        {c.last_fetch_ok === false && (
                          <span className="inline-flex items-center gap-1 text-[0.7rem] font-medium text-amber-600 dark:text-amber-400">
                            <TriangleAlert className="size-3" />
                            last check failed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {!c.notify && (
                          <span className="mr-1 font-mono text-[0.65rem] uppercase text-muted-foreground">
                            muted
                          </span>
                        )}
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={c.archived ? "Restore to tracking" : "Archive"}
                          title={c.archived ? "Restore to tracking" : "Archive"}
                          onClick={() => onArchive(c.id, !c.archived)}
                        >
                          {c.archived ? <ArchiveRestore /> : <Archive />}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={checking.has(c.id)}
                          onClick={() => onRefresh(c.id)}
                        >
                          <RefreshCw className={cn(checking.has(c.id) && "animate-spin")} />
                          {checking.has(c.id) ? "Checking…" : "Refresh"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      </div>
    </>
  );
}
