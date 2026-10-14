import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
let child;
let baseUrl;
let tempDir;

async function freePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(url) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url + "/health");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Collector did not become healthy in time.");
}

before(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "gomez-aviator-test-"));
  const port = await freePort();
  baseUrl = "http://127.0.0.1:" + port;
  child = spawn(process.execPath, [path.join(here, "server.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: path.join(tempDir, "rounds.jsonl"),
      INGEST_API_TOKEN: "test-only-secret",
      ALLOWED_SOURCES: "",
      CORS_ORIGINS: "https://gomezdigital.github.io"
    },
    stdio: "ignore"
  });
  await waitForHealth(baseUrl);
});

after(async () => {
  if (child && child.exitCode === null) child.kill("SIGTERM");
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
});

test("health endpoint reports service health but not a live feed", async () => {
  const response = await fetch(baseUrl + "/health");
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.liveProviderConnected, false);
});

test("source endpoint marks sources as not verified", async () => {
  const response = await fetch(baseUrl + "/api/v1/sources");
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.liveFeedVerified, false);
  assert.ok(body.sources.every((source) => source.liveFeedVerified === false));
});

test("round endpoint returns an empty list before ingestion", async () => {
  const response = await fetch(baseUrl + "/api/v1/rounds?limit=10");
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.rounds, []);
  assert.equal(body.count, 0);
});

test("ingestion rejects requests without a bearer token", async () => {
  const response = await fetch(baseUrl + "/api/v1/ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "betway", rounds: [] })
  });
  assert.equal(response.status, 401);
});

test("ingestion remains disabled when no source is authorized", async () => {
  const response = await fetch(baseUrl + "/api/v1/ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-only-secret"
    },
    body: JSON.stringify({
      source: "betway",
      rounds: [{ roundId: "fake-test-round", multiplier: 1.65, endedAt: new Date().toISOString() }]
    })
  });
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.match(body.error, /source is not enabled/i);
});
