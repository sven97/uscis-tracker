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
      setMsg({ text: "Test notification sent — check your channel(s).", ok: true });
    } catch (err) {
      setMsg({ text: err instanceof ApiError ? err.message : "Test failed", ok: false });
    }
  };

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <>
      <p><Link to="/">← Back to cases</Link></p>
      <h1>Settings</h1>

      {msg && (
        <div className={msg.ok ? "success-box" : "error"}>{msg.text}</div>
      )}

      <div className="card">
        <h2>Notifications</h2>
        <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
          One <a href="https://github.com/caronc/apprise/wiki" target="_blank" rel="noreferrer">Apprise URL</a> per
          line. Supports Telegram, Discord, ntfy, Slack, email, Gotify, Matrix, webhooks, and 100+ more.
          Examples:
        </p>
        <pre className="hint">{`tgram://bottoken/ChatID
discord://webhook_id/webhook_token
ntfy://ntfy.sh/your-topic
mailto://user:pass@gmail.com`}</pre>
        <div className="field">
          <label>Apprise URLs</label>
          <textarea rows={5} value={urls} onChange={(e) => setUrls(e.target.value)}
            placeholder="ntfy://ntfy.sh/my-uscis-topic" />
        </div>
      </div>

      <div className="card">
        <h2>Polling</h2>
        <div className="field" style={{ maxWidth: 220 }}>
          <label>Check interval (hours)</label>
          <input type="number" min={0.1} step={0.5} value={interval}
            onChange={(e) => setIntervalHours(e.target.value)} />
        </div>
      </div>

      <div className="row">
        <button onClick={save}>Save</button>
        <button className="secondary" onClick={test}>Send test notification</button>
      </div>
    </>
  );
}
