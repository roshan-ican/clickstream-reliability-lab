import http from "node:http";
import { readFile } from "node:fs/promises";
import {
  CreateStreamCommand,
  DescribeStreamSummaryCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  ListShardsCommand,
  PutRecordCommand
} from "@aws-sdk/client-kinesis";
import { kinesis, streamName } from "./aws.mjs";
import { normalizeEvent } from "./event.mjs";
import { decodeRecords } from "./records.mjs";

const port = Number(process.env.COLLECTOR_PORT ?? 8787);
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? "*";
const maxBodyBytes = 10_000;
const maxRecent = 500;
const recent = [];
const dashboardPath = new URL("../public/dashboard.html", import.meta.url);

function remember(event) {
  recent.push(event);
  if (recent.length > maxRecent) recent.shift();
}

async function backfill() {
  const seen = new Set();
  const { Shards } = await kinesis.send(new ListShardsCommand({ StreamName: streamName }));
  for (const shard of Shards ?? []) {
    const start = await kinesis.send(
      new GetShardIteratorCommand({ StreamName: streamName, ShardId: shard.ShardId, ShardIteratorType: "TRIM_HORIZON" })
    );
    let iterator = start.ShardIterator;
    while (iterator) {
      const result = await kinesis.send(new GetRecordsCommand({ ShardIterator: iterator, Limit: 100 }));
      for (const event of decodeRecords(result.Records, seen)) remember(event);
      if (result.Records.length === 0 || result.MillisBehindLatest === 0) break;
      iterator = result.NextShardIterator;
    }
  }
  recent.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  recent.splice(0, Math.max(0, recent.length - maxRecent));
}

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

async function ensureStream() {
  try {
    await kinesis.send(new DescribeStreamSummaryCommand({ StreamName: streamName }));
  } catch (error) {
    if (error.name !== "ResourceNotFoundException") throw error;
    await kinesis.send(new CreateStreamCommand({ StreamName: streamName, ShardCount: 1 }));
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(Object.assign(new Error("Payload too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { ...corsHeaders, "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function handleEvents(req, res) {
  let parsed;
  try {
    parsed = JSON.parse(await readBody(req));
  } catch (error) {
    return send(res, error.status ?? 400, { error: error.message });
  }

  const items = Array.isArray(parsed) ? parsed : [parsed];
  const events = [];
  try {
    for (const item of items) events.push(normalizeEvent(item));
  } catch (error) {
    return send(res, 422, { error: error.message });
  }

  for (const event of events) {
    await kinesis.send(
      new PutRecordCommand({
        StreamName: streamName,
        PartitionKey: event.sessionId,
        Data: Buffer.from(JSON.stringify(event))
      })
    );
    remember(event);
  }
  send(res, 202, { accepted: events.length });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    return res.end();
  }
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
  if (req.method === "GET" && req.url.startsWith("/api/events")) {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ now: new Date().toISOString(), events: recent.slice().reverse() }));
  }
  if (req.method === "GET" && (req.url === "/" || req.url === "/dashboard")) {
    try {
      const page = await readFile(dashboardPath);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(page);
    } catch {
      return send(res, 404, { error: "Dashboard file missing" });
    }
  }
  if (req.method === "POST" && req.url === "/events") {
    try {
      return await handleEvents(req, res);
    } catch (error) {
      console.error(error);
      return send(res, 502, { error: "Could not write to Kinesis" });
    }
  }
  send(res, 404, { error: "Not found" });
});

await ensureStream();
await backfill();
server.listen(port, "127.0.0.1", () => {
  console.log(`Collector listening on http://127.0.0.1:${port}/events -> stream ${streamName}`);
  console.log(`Dashboard at http://127.0.0.1:${port}/dashboard (${recent.length} events loaded)`);
});
