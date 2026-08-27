import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import * as settingsApi from "../api/settings";
import { ApiError } from "../api/types";
import { Button, buttonVariants } from "@/components/animate-ui/components/buttons/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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

  if (loading) {
    return <p className="py-14 text-center text-muted-foreground">Loading settings…</p>;
  }

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-3")}
      >
        <ArrowLeft />
        All cases
      </Link>

      <h1 className="font-heading text-2xl font-semibold tracking-tight">Settings</h1>

      {msg && (
        <Alert variant={msg.ok ? "default" : "destructive"}>
          <AlertDescription>{msg.text}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-3">
          <CardTitle>Notification channels</CardTitle>
          <p className="text-sm text-muted-foreground">
            One{" "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href="https://github.com/caronc/apprise/wiki"
              target="_blank"
              rel="noreferrer"
            >
              Apprise URL
            </a>{" "}
            per line — Telegram, Discord, ntfy, Slack, email, Gotify, Matrix, webhooks, and 100+ more.
          </p>
          <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
{`ntfy://ntfy.sh/my-uscis-topic
tgram://bottoken/ChatID
discord://webhook_id/webhook_token
mailto://user:pass@gmail.com`}
          </pre>
          <div className="space-y-1.5">
            <Label htmlFor="apprise">Apprise URLs</Label>
            <Textarea
              id="apprise"
              rows={5}
              className="font-mono text-xs"
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder="ntfy://ntfy.sh/my-uscis-topic"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <CardTitle>Polling</CardTitle>
          <div className="max-w-[200px] space-y-1.5">
            <Label htmlFor="interval">Check interval — hours</Label>
            <Input
              id="interval"
              type="number"
              min={0.1}
              step={0.5}
              value={interval}
              onChange={(e) => setIntervalHours(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={save}>Save changes</Button>
        <Button variant="outline" onClick={test}>
          Send test notification
        </Button>
      </div>
    </div>
  );
}
