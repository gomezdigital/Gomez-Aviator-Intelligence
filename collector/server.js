import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const DATA_FILE = path.resolve(process.env.DATA_FILE || path.join(__dirname, "data", "rounds.jsonl"));
const INGEST_TOKEN = process.env.INGEST_API_TOKEN || "";
const READ_TOKEN = process.env.READ_API_TOKEN || "";
const ALLOWED_SOURCES = new Set(
  (process.env.ALLOWED_SOURCES || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
);
const CORS_ORIGINS = new Set(
  (process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)
);
const MAX_BODY_BYTES = 256 * 1024;
const MAX_RETURNED_ROUNDS = 500;
const SOURCES = ["betway", "sportybet", "other-authorized-provider", "user-import"];
let writeQueue = Promise.resolve();

function json(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
}

function timingSafeTokenMatch(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  return a.length === b.length && a.length > 0 && (awaitlessEqual(a, b));
}

function awaitlessEqual(a, b) {
  // Constant-time comparison for equal-length token buffers.
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a[i] ^ b[i];
  return result === 0;
}

function hasBearer(req, expected) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? timingSafeTokenMatch(match[1], expected) : false;
}

function allowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return null;
  return CORS_ORIGINS.has(origin) ? origin : false;
}

function applyCors(req, res) {
  const origin = allowedOrigin(req);
  if (origin === false) return false;
  if (origin) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "Origin");
    res.setHeader("access-control-allow-headers", "Authorization, Content-Type");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  }
  return true;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function normalizeRound(input, source) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Each round must be a JSON object." };
  }
  const roundId = String(input.roundId ?? "").trim();
  const multiplier = Number(input.multiplier);
  const endedAt = String(input.endedAt ?? "");
  const time = Date.parse(endedAt);

  if (!roundId || roundId.length > 180) return { error: "roundId is required (max 180 characters)." };
  if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 100000000) {
    return { error: "multiplier must be a finite number from 1 to 100000000." };
  }
  if (!endedAt || !Number.isFinite(time)) return { error: "endedAt must be a valid ISO-compatible timestamp." };
  if (time > Date.now() + 5 * 60 * 1000) return { error: "endedAt is too far in the future." };

  return {
    record: {
      source,
      roundId,
      multiplier,
      endedAt: new Date(time).toISOString(),
      receivedAt: new Date().toISOString()
    }
  };
}

async function readAllRecords() {
  try {
    const content = await fs.promises.readFile(DATA_FILE, "utf8");
    const rows = [];
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if (row && typeof row === "object" && row.source && row.roundId) rows.push(row);
      } catch {
        // Ignore a damaged line, but preserve it on disk for investigation.
      }
    }
    return rows;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function appendRecords(records) {
  writeQueue = writeQueue.then(async () => {
    await fs.promises.mkdir(path.dirname(DATA_FILE), { recursive: true });
    const lines = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
    await fs.promises.appendFile(DATA_FILE, lines, { encoding: "utf8", mode: 0o600 });
  });
  return writeQueue;
}

function sourceHealth(records) {
  return SOURCES.map((source) => {
    const sourceRows = records.filter((r) => r.source === source);
    const latest = sourceRows.reduce((best, r) => {
      const t = Date.parse(r.endedAt);
      return Number.isFinite(t) && t > best ? t : best;
    }, 0);
    return {
      source,
      allowedForIngestion: ALLOWED_SOURCES.has(source),
      status: sourceRows.length === 0 ? "NO_DATA" : "RECORDED_DATA",
      records: sourceRows.length,
      lastRoundAt: latest ? new Date(latest).toISOString() : null,
      liveFeedVerified: false
    };
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (!applyCors(req, res)) return json(res, 403, { error: "Origin is not allowed." });
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url || "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, {
        ok: true,
        service: "Gomez Aviator Intelligence Collector",
        liveProviderConnected: false,
        note: "Service health does not mean an Aviator source is connected."
      });
    }

    if (req.method === "GET" && url.pathname === "/api/v1/sources") {
      if (!hasBearer(req, READ_TOKEN)) return json(res, 401, { error: "Valid read token required." });
      const records = await readAllRecords();
      return json(res, 200, { sources: sourceHealth(records), liveFeedVerified: false });
    }

    if (req.method === "GET" && url.pathname === "/api/v1/rounds") {
      if (!hasBearer(req, READ_TOKEN)) return json(res, 401, { error: "Valid read token required." });
      const limitParam = Number(url.searchParams.get("limit") || 100);
      const limit = Number.isInteger(limitParam) ? Math.min(Math.max(limitParam, 1), MAX_RETURNED_ROUNDS) : 100;
      const source = (url.searchParams.get("source") || "").trim().toLowerCase();
      const records = await readAllRecords();
      const filtered = records
        .filter((r) => !source || r.source === source)
        .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt))
        .slice(0, limit);
      return json(res, 200, {
        rounds: filtered,
        count: filtered.length,
        sourceFilter: source || null,
        liveFeedVerified: false
      });
    }

    if (req.method === "POST" && url.pathname === "/api/v1/ingest") {
      if (!hasBearer(req, INGEST_TOKEN)) return json(res, 401, { error: "Valid ingest token required." });
      const body = await readBody(req);
      const source = String(body?.source ?? "").trim().toLowerCase();
      if (!ALLOWED_SOURCES.has(source)) {
        return json(res, 403, {
          error: "This source is not enabled for ingestion.",
          note: "Only enable a source after confirming the collection method is documented and authorized."
        });
      }
      if (!Array.isArray(body.rounds) || body.rounds.length < 1 || body.rounds.length > 500) {
        return json(res, 400, { error: "rounds must contain between 1 and 500 records." });
      }

      const normalized = [];
      const errors = [];
      body.rounds.forEach((input, index) => {
        const result = normalizeRound(input, source);
        if (result.error) errors.push({ index, error: result.error });
        else normalized.push(result.record);
      });
      if (errors.length) return json(res, 400, { error: "One or more records failed validation.", details: errors });

      const existing = await readAllRecords();
      const known = new Set(existing.map((r) => source + "::" + r.roundId));
      const batchKnown = new Set();
      const accepted = [];
      let duplicates = 0;
      for (const record of normalized) {
        const key = source + "::" + record.roundId;
        if (known.has(key) || batchKnown.has(key)) {
          duplicates += 1;
          continue;
        }
        batchKnown.add(key);
        accepted.push(record);
      }
      if (accepted.length) await appendRecords(accepted);
      return json(res, 201, {
        source,
        accepted: accepted.length,
        duplicates,
        rejected: 0,
        note: "Accepted records are stored as supplied; ingestion does not verify the source or prove a live feed.",
        liveFeedVerified: false
      });
    }

    return json(res, 404, { error: "Not found." });
  } catch (error) {
    console.error("Request failed:", error.message);
    return json(res, error.statusCode || 500, {
      error: error.statusCode ? error.message : "Internal server error."
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Gomez Aviator Intelligence Collector listening on port ${PORT}`);
  if (!INGEST_TOKEN || !READ_TOKEN) {
    console.warn("WARNING: Set separate INGEST_API_TOKEN and READ_API_TOKEN secrets before deployment.");
  }
  if (ALLOWED_SOURCES.size === 0) {
    console.warn("No sources enabled. Ingestion is intentionally disabled until an authorized source is configured.");
  }
});
