# ── Stage 1: build the React SPA ──────────────────────────────────────────────
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ── Stage 2: the Python app (serves the API + the built SPA) ──────────────────
FROM python:3.12-slim

# libxml2/libxslt for lxml; curl for curl_cffi + healthcheck.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libxml2 libxslt1.1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY --from=web /web/dist ./app/static

RUN mkdir -p /app/data

ENV PYTHONUNBUFFERED=1 STATIC_DIR=app/static
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
