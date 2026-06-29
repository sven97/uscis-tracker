import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router-dom";
import * as casesApi from "../api/cases";
import { pollUntilChecked } from "../api/poll";
import { ApiError, type Case } from "../api/types";
import { railColor, StatusBadge } from "../components/StatusBadge";

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
  const activeCount = cases.filter((c) => !c.is_finished).length;
  const doneCount = cases.length - activeCount;

  return (
    <>
      <div className="page-head">
        <div className="eyebrow">Tracking Registry</div>
        <h1>Your case files</h1>
        <div className="tally">
          {String(activeCount).padStart(2, "0")} active &nbsp;·&nbsp;{" "}
          {String(doneCount).padStart(2, "0")} complete
        </div>
      </div>

      <form className="panel" onSubmit={onAdd}>
        <div className="add-card">
          <div className="field">
            <label>Receipt number</label>
            <input type="text" name="receipt" placeholder="IOE1234567890" value={receipt} required
              pattern="[A-Za-z]{3}\d{10}" title="3 letters + 10 digits"
              onChange={(e) => setReceipt(e.target.value)} />
          </div>
          <div className="field">
            <label>Nickname — optional</label>
            <input type="text" placeholder="My work permit" value={nickname}
              onChange={(e) => setNickname(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={adding}>
            {adding ? "Filing…" : "Open a file"}
          </button>
        </div>
      </form>

      {error && <div className="error-box">{error}</div>}

      <div className="tabs">
        {(["all", "active", "finished"] as Filter[]).map((f) => (
          <button key={f} className={`tab${filter === f ? " active" : ""}`} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty">Opening the registry…</div>
      ) : shown.length === 0 ? (
        <div className="empty">No files here yet. Open one above to begin tracking.</div>
      ) : (
        shown.map((c, i) => (
          <article
            className="dossier"
            key={c.id}
            style={{ "--rail": railColor(c.status), animationDelay: `${i * 60}ms` } as CSSProperties}
          >
            <div className="dossier-main">
              <div>
                {c.form_num && <span className="form-chip">{c.form_num}</span>}
                {c.form_title && <span className="form-title">{c.form_title}</span>}
              </div>
              <h2 className="dossier-name">
                <Link to={`/cases/${c.id}`}>{c.nickname || c.receipt_number}</Link>
              </h2>
              <div className="receipt">{c.receipt_number}</div>
              <div className="dossier-foot">
                <span className="timestamp">{lastChecked(c.last_checked)}</span>
                {!c.notify && <span className="muted-chip">muted</span>}
                {checking.has(c.id) && (
                  <span className="checking-chip"><span className="dot" />Checking</span>
                )}
              </div>
            </div>
            <div className="dossier-side">
              <StatusBadge c={c} />
              <button className="btn btn-ghost btn-sm" disabled={checking.has(c.id)} onClick={() => onRefresh(c.id)}>
                {checking.has(c.id) ? "Checking…" : "Refresh"}
              </button>
            </div>
          </article>
        ))
      )}
    </>
  );
}
