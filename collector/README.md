# Gomez Aviator Intelligence — Collector API

A small Node.js service for receiving **normalized completed-round records** from a documented, authorized data source. This is the backend component; GitHub Pages alone cannot run a persistent collector.

## Current status

- Collector API scaffold: implemented.
- Provider adapters: **not implemented** because no authorized Betway/SportyBet result feed has been verified.
- Live source: **NOT CONNECTED**.
- Ingestion is disabled by default because `ALLOWED_SOURCES` is empty.
- The service does not scrape game pages, log into operator accounts, use session cookies, place bets, or predict the next multiplier.

The official Aviator Studio Round History API requires provider identity/authentication and IP allowlisting; its documented request requires a round ID. This is not evidence of a public Betway/SportyBet stream. See https://docs.crash.aviator.studio/round-history/ and https://docs.crash.aviator.studio/game-integration/integration-endpoints/.

## API

All responses are JSON. Use HTTPS in production.

### Health check

`GET /health`

No secret required. Returns service health only and explicitly says whether a live provider is connected (currently always false).

### List source status

`GET /api/v1/sources`

Requires `Authorization: Bearer $READ_API_TOKEN`.

### Read latest records

`GET /api/v1/rounds?limit=100&source=betway`

Requires `Authorization: Bearer $READ_API_TOKEN`. Maximum 500 records per request. The optional source filter is `betway`, `sportybet`, `other-authorized-provider`, or `user-import`.

### Ingest completed rounds

`POST /api/v1/ingest`

Requires `Authorization: Bearer $INGEST_API_TOKEN` and a source explicitly listed in `ALLOWED_SOURCES`.

Example payload (illustrative only; not real game data):

```json
{
  "source": "betway",
  "rounds": [
    {
      "roundId": "example-round-123",
      "multiplier": 1.65,
      "endedAt": "2026-10-14T11:59:58.000Z"
    }
  ]
}
```

The example round is fake and must not be presented as a real result. The collector validates required fields, numeric ranges and timestamps; rejects a batch with invalid rows; and deduplicates by source + round ID.

## Environment

Copy `.env.example` into your deployment's environment settings; do not commit real values. Set:
- `INGEST_API_TOKEN`: long random secret for trusted collectors.
- `READ_API_TOKEN`: a different long random secret for authorized readers.
- `DATA_FILE`: persistent disk path, e.g. `/data/rounds.jsonl`.
- `CORS_ORIGINS`: exact dashboard origin(s), no wildcard.
- `ALLOWED_SOURCES`: keep empty until source access is authorized and configured.

The collector stores newline-delimited JSON records. Attach a persistent disk in the hosting environment; ephemeral storage may lose records on redeploy/restart. Configure backups and disk permissions. For higher volume or multi-instance deployment, replace this file store with a managed database and transactional unique constraint on `(source, roundId)`.

## Run locally

Requires Node.js 20 or newer.

```sh
cd collector
cp .env.example .env
# Set real, long random secrets in your local environment; never commit .env.
npm start
```

The service uses Node.js built-ins and has no third-party package dependencies. Environment variables must be exported by your shell or supplied by the hosting platform; the example does not auto-load `.env`.

## Deploy

Deploy this directory as a Node web service on a backend host that supports environment secrets and a persistent disk. Set the start command to `npm start`, configure the variables above, and set the persistent data path. Keep `ALLOWED_SOURCES` empty until the feed has been approved and a source-specific adapter is implemented.

## Security and research limitations

- Never place API secrets in the public dashboard JavaScript, static HTML, or GitHub Pages.
- Never supply operator passwords, session cookies, or browser tokens to this collector.
- Do not bypass authentication, anti-bot controls, access restrictions, or source terms.
- An ingest token authenticates the caller, not the truth of the data. A source adapter must verify data origin before records are described as provider-verified.
- Do not combine rounds from different operators as if they were the same round.
- Historical frequencies are descriptive; they do not establish a reliable prediction of the next round.
