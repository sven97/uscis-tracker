import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, LoaderCircle, Send, Trash2, X } from "lucide-react";
import * as settingsApi from "../api/settings";
import { ApiError } from "../api/types";
import { Button, buttonVariants } from "@/components/animate-ui/components/buttons/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { describeChannel, looksLikeAppriseUrl } from "@/lib/apprise";
import { useTheme, type Theme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

const INTERVALS = [1, 2, 4, 8, 12, 24];

const SELECT_CLS =
  "h-8 w-full max-w-[220px] rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30";

function intervalLabel(h: number): string {
  if (h < 1) return `Every ${Math.round(h * 60)} minutes`;
  return `Every ${h} hour${h === 1 ? "" : "s"}`;
}

type TestState = "sending" | "ok" | "fail";

function SavedTag({ show }: { show: boolean }) {
  return (
    <span
      className={cn(
        "text-xs text-muted-foreground transition-opacity duration-300",
        show ? "opacity-100" : "opacity-0",
      )}
    >
      Saved
    </span>
  );
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [channels, setChannels] = useState<string[]>([]);
  const [interval, setInterval] = useState(4);
  const [pollEnabled, setPollEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [notifError, setNotifError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [saved, setSaved] = useState<"notif" | "poll" | null>(null);
  const savedTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const s = await settingsApi.getSettings();
        setChannels(s.apprise_urls);
        setInterval(s.poll_interval_hours);
        setPollEnabled(s.poll_enabled);
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const flashSaved = (which: "notif" | "poll") => {
    setSaved(which);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(null), 1600);
  };

  const persistChannels = async (next: string[]) => {
    const prev = channels;
    setChannels(next);
    setNotifError(null);
    try {
      const s = await settingsApi.updateSettings({ apprise_urls: next });
      setChannels(s.apprise_urls);
      flashSaved("notif");
    } catch (err) {
      setChannels(prev);
      setNotifError(err instanceof ApiError ? err.message : "Couldn't save channels");
    }
  };

  const addChannel = async (e: FormEvent) => {
    e.preventDefault();
    const url = draft.trim();
    if (!looksLikeAppriseUrl(url)) {
      setNotifError("That doesn't look like an Apprise URL — it needs a scheme:// prefix.");
      return;
    }
    if (channels.includes(url)) {
      setNotifError("That channel is already in the list.");
      return;
    }
    setDraft("");
    await persistChannels([...channels, url]);
  };

  const removeChannel = (url: string) => persistChannels(channels.filter((c) => c !== url));

  const testChannel = async (url: string) => {
    setTests((t) => ({ ...t, [url]: "sending" }));
    let result: TestState;
    try {
      await settingsApi.testNotification(url);
      result = "ok";
    } catch {
      result = "fail";
    }
    setTests((t) => ({ ...t, [url]: result }));
    window.setTimeout(
      () => setTests((t) => {
        const { [url]: _, ...rest } = t;
        return rest;
      }),
      2600,
    );
  };

  const savePoll = async (patch: { poll_interval_hours?: number; poll_enabled?: boolean }) => {
    const prev = { interval, pollEnabled };
    if (patch.poll_interval_hours !== undefined) setInterval(patch.poll_interval_hours);
    if (patch.poll_enabled !== undefined) setPollEnabled(patch.poll_enabled);
    setPollError(null);
    try {
      const s = await settingsApi.updateSettings(patch);
      setInterval(s.poll_interval_hours);
      setPollEnabled(s.poll_enabled);
      flashSaved("poll");
    } catch (err) {
      setInterval(prev.interval);
      setPollEnabled(prev.pollEnabled);
      setPollError(err instanceof ApiError ? err.message : "Couldn't save that");
    }
  };

  const intervalOptions = useMemo(() => {
    const opts = INTERVALS.map((h) => ({ value: h, label: intervalLabel(h) }));
    if (!INTERVALS.includes(interval)) {
      opts.unshift({ value: interval, label: intervalLabel(interval) });
    }
    return opts;
  }, [interval]);

  if (loading) {
    return <p className="py-14 text-center text-muted-foreground">Loading settings…</p>;
  }
  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-3")}>
        <ArrowLeft />
        All cases
      </Link>

      <h1 className="font-heading text-2xl font-semibold tracking-tight">Settings</h1>

      {/* Appearance */}
      <Card>
        <CardContent className="space-y-4">
          <CardTitle>Appearance</CardTitle>
          <p className="text-sm text-muted-foreground">
            Theme for this browser. "System" follows your device setting.
          </p>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
            className={SELECT_CLS}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Notifications</CardTitle>
            <SavedTag show={saved === "notif"} />
          </div>
          <p className="text-sm text-muted-foreground">
            Get alerted when a tracked case's status changes. Each channel is one{" "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="https://github.com/caronc/apprise/wiki"
              target="_blank"
              rel="noreferrer"
            >
              Apprise URL
            </a>{" "}
            — email, Telegram, Discord, ntfy, Slack, Gotify, Matrix, webhooks, and 100+ more.
          </p>

          {channels.length > 0 ? (
            <ul className="space-y-2">
              {channels.map((url) => {
                const { type, summary } = describeChannel(url);
                const st = tests[url];
                return (
                  <li
                    key={url}
                    className="flex items-center gap-2.5 rounded-lg border px-3 py-2"
                  >
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[0.7rem] font-medium">
                      {type}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                      {summary}
                    </span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Send a test"
                      title="Send a test"
                      disabled={st === "sending"}
                      onClick={() => testChannel(url)}
                    >
                      {st === "sending" ? (
                        <LoaderCircle className="animate-spin" />
                      ) : st === "ok" ? (
                        <Check className="text-emerald-600 dark:text-emerald-400" />
                      ) : st === "fail" ? (
                        <X className="text-destructive" />
                      ) : (
                        <Send />
                      )}
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Remove channel"
                      title="Remove channel"
                      onClick={() => removeChannel(url)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No channels yet — add one below to get status-change alerts.
            </p>
          )}

          <form onSubmit={addChannel} className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setNotifError(null);
              }}
              placeholder="ntfy://ntfy.sh/my-uscis-topic"
              className="font-mono text-xs"
            />
            <Button type="submit">Add</Button>
          </form>
          {notifError && <p className="text-xs text-destructive">{notifError}</p>}
          <p className="font-mono text-[0.7rem] leading-relaxed text-muted-foreground">
            ntfy://ntfy.sh/topic · tgram://bottoken/ChatID ·
            mailto://user:pass@gmail.com?to=you@example.com
          </p>
        </CardContent>
      </Card>

      {/* Polling */}
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Background checks</CardTitle>
            <SavedTag show={saved === "poll"} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Check cases automatically</div>
              <div className="text-xs text-muted-foreground">
                {pollEnabled
                  ? "The tracker polls USCIS in the background."
                  : "Off — cases are only checked when you hit Refresh."}
              </div>
            </div>
            <Switch
              checked={pollEnabled}
              onCheckedChange={(v) => savePoll({ poll_enabled: v })}
            />
          </div>

          <div className={cn("space-y-1.5", !pollEnabled && "opacity-50")}>
            <label className="block text-xs text-muted-foreground">How often</label>
            <select
              value={interval}
              disabled={!pollEnabled}
              onChange={(e) => savePoll({ poll_interval_hours: Number(e.target.value) })}
              className={SELECT_CLS}
            >
              {intervalOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {pollError && <p className="text-xs text-destructive">{pollError}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
