import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as casesApi from "../api/cases";
import { pollUntilChecked } from "../api/poll";
import { ApiError, type Case, type CaseEvent, type CaseUpdate } from "../api/types";
import { StatusBadge } from "../components/StatusBadge";

export function CaseDetailPage() {
  const { id = "" } = useParams();
  const caseId = Number(id);
  const navigate = useNavigate();
  const [c, setC] = useState<Case | null>(null);
  const [history, setHistory] = useState<CaseEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [checking, setChecking] = useState(false);

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
      await casesApi.refreshCase(caseId); // returns immediately; fetch runs in background
      await pollUntilChecked(caseId, since, setC);
      setHistory(await casesApi.caseHistory(caseId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Refresh failed");
    } finally {
      setChecking(false);
    }
  };

  const onDelete = async () => {
    if (!confirm("Stop tracking this case?")) return;
    try {
      await casesApi.deleteCase(caseId);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  };

  if (error && !c) return <div className="error">{error}</div>;
  if (!c) return <p className="muted">Loading…</p>;

  return (
    <>
      <p><Link to="/">← Back to cases</Link></p>
      <h1>{c.nickname || c.receipt_number}</h1>
      <p className="muted">
        {c.receipt_number}
        {c.form_title && ` · ${c.form_num} — ${c.form_title}`}
      </p>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <div style={{ marginBottom: "0.6rem" }}>
          <StatusBadge c={c} /> {c.is_finished && <span className="badge dark">Done</span>}
        </div>
        {c.detail && <p style={{ fontSize: "0.9rem" }} dangerouslySetInnerHTML={{ __html: c.detail }} />}
        <p className="muted" style={{ fontSize: "0.8rem" }}>
          {c.last_checked ? `Last checked: ${new Date(c.last_checked).toLocaleString()}` : "Not yet checked"}
        </p>
        <button className="secondary small" onClick={onRefresh} disabled={checking}>
          {checking ? "Checking…" : "Refresh now"}
        </button>
      </div>

      <div className="card">
        <h2>Settings</h2>
        <div className="row" style={{ marginBottom: "0.8rem" }}>
          <div className="field" style={{ flex: 2 }}>
            <label>Nickname</label>
            <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </div>
          <button className="secondary" onClick={() => patch({ nickname: nickname.trim() || null })}>
            Save
          </button>
        </div>
        <div className="checkbox-row">
          <input type="checkbox" id="notify" checked={c.notify}
            onChange={(e) => patch({ notify: e.target.checked })} />
          <label htmlFor="notify">Notify me when this case changes</label>
        </div>
      </div>

      <div className="card">
        <h2>History</h2>
        {history.length === 0 ? (
          <p className="muted">No status changes recorded yet.</p>
        ) : (
          history.map((e, i) => (
            <div className="timeline-item" key={i}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong style={{ fontSize: "0.9rem" }}>{e.action_code_text}</strong>
                <span className="muted" style={{ fontSize: "0.78rem" }}>
                  {new Date(e.recorded_at).toLocaleString()}{" "}
                  <span className="badge">{e.source}</span>
                </span>
              </div>
              {e.action_code_desc && (
                <p className="muted" style={{ fontSize: "0.82rem", margin: "0.3rem 0 0" }}
                  dangerouslySetInnerHTML={{ __html: e.action_code_desc }} />
              )}
            </div>
          ))
        )}
      </div>

      <button className="danger" onClick={onDelete}>Stop tracking</button>
    </>
  );
}
