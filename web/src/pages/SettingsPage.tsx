import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as settingsApi from "../api/settings";
import { ApiError } from "../api/types";

export function SettingsPage() {
  const [urls, setUrls] = useState("");
  const [interval, setIntervalHours] = useState("4");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await settingsApi.getSettings();
        setUrls(s.apprise_urls.join("\n"));
        setIntervalHours(String(s.poll_interval_hours));
      } catch (err) {
        setMsg({ text: err instanceof ApiError ? err.message : "Failed to load", ok: false });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setMsg(null);
    try {
      const s = await settingsApi.updateSettings({
        apprise_urls: urls.split("\n").map((u) => u.trim()).filter(Boolean),
        poll_interval_hours: Number(interval) || 4,
      });
      setUrls(s.apprise_urls.join("\n"));
      setIntervalHours(String(s.poll_interval_hours));
      setMsg({ text: "Saved.", ok: true });
    } catch (err) {
      setMsg({ text: err instanceof ApiError ? err.message : "Save failed", ok: false });
    }
  };

  const test = async () => {
    setMsg(null);
    try {
      await settingsApi.testNotification();
      setMsg({ text: "Test dispatched — check your channel(s).", ok: true });
    } catch (err) {
      setMsg({ text: err instanceof ApiError ? err.message : "Test failed", ok: false });
    }
  };

  if (loading) return <div className="empty">Loading settings…</div>;

  return (
    <div className="fade-in">
      <Link to="/" className="backlink">← Registry</Link>

      <div className="page-head" style={{ marginTop: "0.9rem" }}>
        <div className="eyebrow">Preferences</div>
        <h1>Settings</h1>
      </div>

      {msg && <div className={msg.ok ? "ok-box" : "error-box"}>{msg.text}</div>}

      <div className="panel">
        <div className="panel-title">Notification channels</div>
        <p className="muted" style={{ fontSize: "0.88rem", lineHeight: 1.6, marginTop: 0 }}>
          One{" "}
          <a href="https://github.com/caronc/apprise/wiki" target="_blank" rel="noreferrer">Apprise URL</a>{" "}
          per line — Telegram, Discord, ntfy, Slack, email, Gotify, Matrix, webhooks, and 100+ more.
        </p>
        <pre className="codeblock">{`ntfy://ntfy.sh/my-uscis-topic
tgram://bottoken/ChatID
discord://webhook_id/webhook_token
mailto://user:pass@gmail.com`}</pre>
        <div className="field">
          <label>Apprise URLs</label>
          <textarea rows={5} value={urls} onChange={(e) => setUrls(e.target.value)}
            placeholder="ntfy://ntfy.sh/my-uscis-topic" />
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Polling</div>
        <div className="field" style={{ maxWidth: 200 }}>
          <label>Check interval — hours</label>
          <input type="number" min={0.1} step={0.5} value={interval}
            onChange={(e) => setIntervalHours(e.target.value)} />
        </div>
      </div>

      <div className="row">
        <button className="btn btn-primary" onClick={save}>Save changes</button>
        <button className="btn btn-ghost" onClick={test}>Send test notification</button>
      </div>
    </div>
  );
}
