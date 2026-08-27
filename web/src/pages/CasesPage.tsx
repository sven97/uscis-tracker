import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { RefreshCw } from "lucide-react";
import * as casesApi from "../api/cases";
import { pollUntilChecked } from "../api/poll";
import { ApiError, type Case } from "../api/types";
import { railClass, StatusBadge } from "../components/StatusBadge";
import { Button } from "@/components/animate-ui/components/buttons/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Filter = "all" | "active" | "finished";

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
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [receipt, setReceipt] = useState("");
  const [nickname, setNickname] = useState("");
  const [adding, setAdding] = useState(false);
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

  const onAdd = async (e: FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      const created = await casesApi.createCase({
        receipt_number: receipt.trim(),
        nickname: nickname.trim() || null,
      });
      setReceipt("");
      setNickname("");
      await load();
      setChecker(created.id, true);
      pollUntilChecked(created.id, created.last_checked, replaceCase).finally(() =>
        setChecker(created.id, false),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add case");
    } finally {
      setAdding(false);
    }
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

  const shown = cases.filter((c) =>
    filter === "all" ? true : filter === "finished" ? c.is_finished : !c.is_finished,
  );

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="font-heading text-xl font-semibold tracking-tight">Track a new case</h2>
        <Card>
          <CardContent>
            <form className="space-y-4" onSubmit={onAdd}>
              <div className="space-y-1.5">
                <Label htmlFor="receipt">Receipt number</Label>
                <Input
                  id="receipt"
                  name="receipt"
                  className="font-mono tracking-wider"
                  placeholder="IOE1234567890"
                  value={receipt}
                  required
                  pattern="[A-Za-z]{3}\d{10}"
                  title="3 letters + 10 digits"
                  onChange={(e) => setReceipt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nickname">Nickname — optional</Label>
                <Input
                  id="nickname"
                  placeholder="My work permit"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={adding}>
                {adding ? "Adding…" : "Start tracking"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <section className="space-y-4">
        <h2 className="font-heading text-xl font-semibold tracking-tight">Your cases</h2>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList variant="line">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="finished">Finished</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <p className="py-14 text-center text-muted-foreground">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="py-14 text-center text-muted-foreground">
            No cases yet. Add a receipt number above to start tracking.
          </p>
        ) : (
          <motion.ul
            className="space-y-3"
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.05 } } }}
          >
            {shown.map((c) => (
              <motion.li
                key={c.id}
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  show: { opacity: 1, y: 0 },
                }}
              >
                <Card className="relative overflow-hidden">
                  <div className={cn("absolute inset-y-0 left-0 w-1", railClass(c.status))} />
                  <CardContent className="flex flex-col gap-2.5 pl-5">
                    <StatusBadge c={c} />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {c.form_num && (
                        <span className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] font-medium text-muted-foreground">
                          {c.form_num}
                        </span>
                      )}
                      {c.form_title && (
                        <span className="text-xs text-muted-foreground">{c.form_title}</span>
                      )}
                    </div>
                    <div>
                      <Link
                        to={`/cases/${c.id}`}
                        className="font-heading text-lg font-medium hover:underline"
                      >
                        {c.nickname || c.receipt_number}
                      </Link>
                      <div className="font-mono text-xs tracking-wider text-muted-foreground">
                        {c.receipt_number}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-0.5">
                      <span className="font-mono text-[0.7rem] text-muted-foreground">
                        {lastChecked(c.last_checked)}
                      </span>
                      <div className="flex items-center gap-2">
                        {!c.notify && (
                          <span className="font-mono text-[0.65rem] uppercase text-muted-foreground">
                            muted
                          </span>
                        )}
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
          </motion.ul>
        )}
      </section>
    </div>
  );
}
