# Web SPA

React + Vite + TypeScript front-end for USCIS Case Tracker. Talks to the app's JSON
API (no auth — designed for a trusted LAN).

## Dev
```bash
cp .env.example .env          # points at the API (default http://localhost:8000/api)
npm install
npm run dev                   # http://localhost:5173
```
Run the API separately (`uvicorn app.main:app --reload` from the repo root).

## Build
`npm run build` outputs static files to `dist/`. In production these are built into
the app image and served same-origin, so `.env.production` pins the API base to `/api`.

## Layout
```
src/api/        client + typed endpoints (cases, settings)
src/pages/      Cases, CaseDetail, Settings
src/components/ Layout, StatusBadge
```
