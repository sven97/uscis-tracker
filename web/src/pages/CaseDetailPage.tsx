import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as casesApi from "../api/cases";
import { pollUntilChecked } from "../api/poll";
import { ApiError, type Case, type CaseEvent, type CaseUpdate } from "../api/types";
import { railColor, StatusBadge } from "../components/StatusBadge";

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
    if (!confirm("Close and stop tracking this file?")) return;
    try {
      await casesApi.deleteCase(caseId);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  };

  if (error && !c) return <div className="error-box">{error}</div>;
  if (!c) return <div className="empty">Retrieving file…</div>;

  return (
    <div className="fade-in">
      <Link to="/" className="backlink">← Registry</Link>

      <div className="detail-head">
        <h1>{c.nickname || c.receipt_number}</h1>
        <div className="detail-meta">
          {c.receipt_number}
          {c.form_title && `  ·  ${c.form_num} — ${c.form_title}`}
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="notice" style={{ borderLeftColor: railColor(c.status) }}>
        <div className="notice-stamp-row">
          <StatusBadge c={c} />
          <span className="timestamp">
            {c.last_checked ? `Checked ${fmt(c.last_checked)}` : "Not yet checked"}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={onRefresh} disabled={checking}
            style={{ marginLeft: "auto" }}>
            {checking ? "Checking…" : "Refresh now"}
          </button>
        </div>
        {c.detail && <div className="notice-body" dangerouslySetInnerHTML={{ __html: c.detail }} />}
      </div>

      <div className="panel">
        <div className="panel-title">File settings</div>
        <div className="row" style={{ marginBottom: "1.1rem" }}>
          <div className="field" style={{ flex: 1, minWidth: 200 }}>
            <label>Nickname</label>
            <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </div>
          <button className="btn btn-ghost" onClick={() => patch({ nickname: nickname.trim() || null })}>
            Save
          </button>
        </div>
        <div className="toggle-row">
          <span className="label">Notify me when this case changes</span>
          <label className="toggle">
            <input type="checkbox" checked={c.notify}
              onChange={(e) => patch({ notify: e.target.checked })} />
            <span className="track" />
            <span className="knob" />
          </label>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">History</div>
        {history.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No status changes recorded yet.</p>
        ) : (
          <div className="timeline">
            {history.map((e, i) => (
              <div className="tl-item" key={i}
                style={{ "--rail": railColor(e.action_code_text), animationDelay: `${i * 50}ms` } as CSSProperties}>
                <div className="tl-head">
                  <span className="tl-status">
                    {e.action_code_text}
                    <span className="tl-source">{e.source}</span>
                  </span>
                  <span className="tl-date">{fmt(e.recorded_at)}</span>
                </div>
                {e.action_code_desc && (
                  <p className="tl-desc" dangerouslySetInnerHTML={{ __html: e.action_code_desc }} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <button className="btn btn-danger" onClick={onDelete}>Close file & stop tracking</button>
    </div>
  );
}
