# USCIS Case Tracker

Self-hosted tracking for USCIS immigration cases. Add your receipt numbers, and it
checks status on a schedule, keeps a history of every change, and pings **your own
notification channel** (Telegram, Discord, ntfy, email, Slack, … 100+ via
[Apprise](https://github.com/caronc/apprise)) when something moves.

Runs as **two containers on your own always-on box** (NAS, mini-PC, home server) —
one command, SQLite, no accounts, no cloud, no API keys.

> **Why self-hosted?** USCIS's site sits behind aggressive bot protection that
> **blocks datacenter IPs and commercial proxy pools** but is fine with a normal
> home/residential connection. So this is built to run on *your* hardware, not in
> the cloud. (See [How it works](#how-it-works).)

---

## Quick start

Requires Docker + Docker Compose.

```bash
mkdir uscis-tracker && cd uscis-tracker
curl -O https://raw.githubusercontent.com/OWNER/uscis-tracker/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/OWNER/uscis-tracker/main/.env.example
docker compose up -d
```

Open **http://localhost:8000**, add a receipt number, and (optionally) set a
notification channel in **Settings**. That's it.

> Replace `OWNER` with the repo owner. The compose file pulls a prebuilt multi-arch
> image (amd64 + arm64) — nothing to build on your device. To build from source
> instead, clone the repo and run `docker compose up -d --build`.

---

## Features

- **Track any case** by receipt number; automatic polling on a configurable interval.
- **Status history** — every change recorded with a timestamp.
- **Finished-case detection** — terminal statuses (approved, denied, card delivered…)
  are flagged Done and skipped by polling.
- **Notifications you control** — one Apprise URL per channel; per-case on/off toggle;
  a "send test" button. No SMTP-only lock-in, no push certificates.
- **Form metadata** — captures form number/title alongside the status.
- Clean web UI (React SPA) served by the same container. No login (designed for your
  trusted LAN).

---

## Configuring notifications

In the **Settings** page, add one [Apprise URL](https://github.com/caronc/apprise/wiki)
per line. A few examples:

```
ntfy://ntfy.sh/my-uscis-topic
tgram://bottoken/ChatID
discord://webhook_id/webhook_token
mailto://user:password@gmail.com
slack://tokenA/tokenB/tokenC
```

Hit **Send test notification** to confirm. Each case has its own notify toggle.

---

## Configuration

Everything has sensible defaults; see `.env.example`. Notifications and poll interval
are best set in the **Settings** UI (stored in the database), but env vars seed them
on first run:

| Variable | Default | Description |
|---|---|---|
| `APPRISE_URLS` | _(empty)_ | Comma/newline-separated Apprise URLs (seed; UI overrides). |
| `POLL_INTERVAL_HOURS` | `4` | How often active cases are checked. |
| `DATABASE_URL` | `sqlite:////app/data/uscis.db` | SQLite file (persisted to `./data`). |
| `FLARESOLVERR_URL` | `http://flaresolverr:8191/v1` | Cloudflare solver service. |
| `CF_SESSION_TTL_MINUTES` | `15` | How long a solved Cloudflare session is reused. |
| `LOG_LEVEL` | `INFO` | Logging level. |

Your data lives in `./data/uscis.db` — back that up to keep your cases + history.

---

## How it works

USCIS runs a Next.js app behind a Cloudflare challenge, and case status comes from a
Next.js Server Action. Fetching one status:

1. **FlareSolverr** (bundled, headless Chrome) solves the Cloudflare challenge and
   returns the clearance cookie + browser User-Agent.
2. The app extracts the current `getCaseStatus` action ID from the site bundle.
3. **curl_cffi** (Chrome TLS impersonation) replays the Server Action to get the JSON.

The solved Cloudflare session is cached in-process and reused for many minutes, so a
warm check is fast and a batch poll solves the challenge once.

**Run it on a residential connection.** Cloudflare blocks USCIS access from datacenter
IPs (cloud VMs) and from commercial residential-proxy pools, but works fine from a
normal home ISP. A NAS / mini-PC / home server on your own internet is ideal.

FlareSolverr's headless Chrome needs ~0.5–1 GB RAM — fine for most mini-PCs and NAS
units, tight on the smallest Raspberry Pis.

---

## Development

```bash
# Backend (API on :8000)
pip install -r requirements.txt
uvicorn app.main:app --reload          # needs a reachable FlareSolverr (set FLARESOLVERR_URL)

# Frontend (Vite dev server on :5173, proxies to the API via web/.env)
cd web && npm install && npm run dev
```

The production image builds the SPA and serves it from the API container (see
`Dockerfile`). `docker compose up -d --build` runs the whole thing locally.

```
app/        FastAPI JSON API, SQLite models, APScheduler poller, USCIS fetch, Apprise
web/        React + Vite SPA (built into the image)
Dockerfile  multi-stage: build SPA -> Python app serves API + static SPA
```

---

## Limitations

- **Only the current status is public.** USCIS's richer "Case History" / "Next Steps"
  require a logged-in myUSCIS account, so this builds its own history forward from when
  you start tracking — it can't backfill earlier events.
- **Not for cloud hosting** — see above; it's a self-host tool by design.
- If USCIS renames its app bundle, update `_ACTION_BUNDLE` in `app/uscis.py`.

## License

MIT — see [LICENSE](LICENSE).
