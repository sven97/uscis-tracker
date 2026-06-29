import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import * as casesApi from "../api/cases";
import { ApiError, type Case } from "../api/types";
import { StatusBadge } from "../components/StatusBadge";

type Filter = "all" | "active" | "finished";

export function CasesPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [receipt, setReceipt] = useState("");
  const [nickname, setNickname] = useState("");
  const [adding, setAdding] = useState(false);

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
      await casesApi.createCase({ receipt_number: receipt.trim(), nickname: nickname.trim() || null });
      setReceipt("");
      setNickname("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add case");
    } finally {
      setAdding(false);
    }
  };

  const onRefresh = async (id: number) => {
    try {
      const updated = await casesApi.refreshCase(id);
      setCases((cs) => cs.map((c) => (c.id === id ? updated : c)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Refresh failed");
    }
  };

  const shown = cases.filter((c) =>
    filter === "all" ? true : filter === "finished" ? c.is_finished : !c.is_finished,
  );

  return (
    <>
      <h1>My Cases</h1>

      <form className="card" onSubmit={onAdd}>
        <div className="row">
          <div className="field" style={{ flex: 2 }}>
            <label>Receipt number</label>
            <input type="text" placeholder="e.g. IOE1234567890" value={receipt} required
              pattern="[A-Za-z]{3}\d{10}" title="3 letters + 10 digits"
              onChange={(e) => setReceipt(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 2 }}>
            <label>Nickname (optional)</label>
            <input type="text" placeholder="e.g. My EAD" value={nickname}
              onChange={(e) => setNickname(e.target.value)} />
          </div>
          <button type="submit" disabled={adding}>{adding ? "Adding…" : "Track case"}</button>
        </div>
      </form>

      {error && <div className="error">{error}</div>}

      <div className="tabs">
        {(["all", "active", "finished"] as Filter[]).map((f) => (
          <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="muted">No cases. Add a receipt number above to start tracking.</p>
        ) : (
          shown.map((c) => (
            <div className="case-row" key={c.id}>
              <div>
                <div className="case-title">
                  <Link to={`/cases/${c.id}`}>{c.nickname || c.receipt_number}</Link>{" "}
                  {c.form_num && <span className="muted">· {c.form_num}</span>}
                </div>
                <div className="case-receipt">{c.receipt_number}</div>
                <div className="case-status">
                  <StatusBadge c={c} />{" "}
                  {c.is_finished && <span className="badge dark">Done</span>}{" "}
                  {!c.notify && <span className="badge">🔕 muted</span>}
                </div>
              </div>
              <button className="secondary small" onClick={() => onRefresh(c.id)}>Refresh</button>
            </div>
          ))
        )}
      </div>
    </>
  );
}
