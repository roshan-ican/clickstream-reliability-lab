# Clickstream Reliability Lab

A local-first clickstream pipeline for a personal website. A small browser tracker sends clicks, page views and scroll depth to a collector. The collector writes each event to a Kinesis stream, a consumer forwards them to an SQS queue, and a worker folds them into per-session summaries. A live dashboard shows what visitors just did.

Everything runs on your machine against AWS Emulator (the Docker image in `Dockerfile.emulator`), so there is no AWS account, no cost and no real data leaving your computer.

```text
Browser tracker -> collector -> Kinesis -> consumer -> SQS -> worker -> session summaries
                       |
                       +-> live dashboard (/dashboard)
```

The browser only ever talks to the collector. AWS credentials never go into the page.

## What you need

- Node.js 22 or newer
- Docker Desktop, running
- AWS CLI, for the smoke test only
- PowerShell (the helper scripts are `.ps1` files for Windows)

```powershell
npm install
```

## Run it

Open a separate PowerShell terminal in the project folder for each step.

**1. Start the emulator.** It listens on `127.0.0.1:9297` only.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.aws\emulator" | Out-Null
```

```powershell
docker compose -f compose.yaml up --build
```

**2. Check that the emulator supports what the project needs** (optional, run once). It creates a stream and a queue, sends one click through both, reads it back and cleans up.

```powershell
npm run smoke
```

**3. Start the collector.**

```powershell
. .\scripts\env.ps1
```

```powershell
npm start
```

`scripts/env.ps1` points the AWS SDK at the emulator (endpoint, credentials file and CA certificate). Run it with the leading dot so the variables stay in that terminal, and run it once in every terminal that starts a Node script.

**4. Start the consumer and the worker** (optional, they add the SQS part).

```powershell
. .\scripts\env.ps1
```

```powershell
npm run consumer
```

```powershell
. .\scripts\env.ps1
```

```powershell
npm run worker
```

The worker prints a line for every task it applies. Press Ctrl+C to print one summary line per session.

**5. Open the dashboard.**

```text
http://127.0.0.1:8787/dashboard
```

The dashboard polls every 1.5 seconds. It shows counts for the last hour, events per minute for the last 30 minutes, the most clicked targets and a live feed with a filter for clicks, page views and scrolls. The filter only affects the feed.

## Track your own site

Copy `public/tracker.js` into your site's static folder, then load it in development only.

Plain HTML:

```html
<script src="/tracker.js" data-endpoint="http://127.0.0.1:8787/events"></script>
```

Next.js, using an environment variable so production builds never load it. Put this in `.env.local`:

```text
NEXT_PUBLIC_CLICKSTREAM_URL=http://127.0.0.1:8787
```

Then in `src/app/layout.tsx`, inside `<body>`:

```tsx
{process.env.NEXT_PUBLIC_CLICKSTREAM_URL && (
  <Script
    src="/tracker.js"
    data-endpoint={`${process.env.NEXT_PUBLIC_CLICKSTREAM_URL}/events`}
    strategy="afterInteractive"
  />
)}
```

Restart the dev server after editing `.env.local`, and reload any page that was already open.

The tracker records a page view on load, a click on any link or button, and scroll depth once each at 25, 50, 75 and 100 percent. It sends only the page path, an event type, a short target label and an anonymous per-tab session ID. It never reads form values.

It sends with `fetch` and `keepalive` rather than `navigator.sendBeacon`. Some browsers and extensions silently drop beacon requests while still reporting success.

## Event shape

```json
{
  "eventId": "7e0f4f0e-3c2a-4a67-9d6e-2f5b0a4a9c11",
  "eventType": "button_click",
  "page": "/work",
  "target": "View Work",
  "sessionId": "sess-abc123",
  "occurredAt": "2026-11-18T10:00:00.000Z",
  "receivedAt": "2026-11-18T10:00:00.120Z"
}
```

`eventType` is one of `page_view`, `button_click`, `link_click` or `scroll_depth`. The collector validates and cleans every payload in `src/event.mjs`: it rejects unknown types and missing fields, truncates strings to 200 characters, drops unknown fields and stamps `receivedAt`.

Keep the data anonymous. Do not capture typed values, passwords, emails or other personal information.

## Collector API

| Route | What it does |
| --- | --- |
| `POST /events` | Accepts one event or an array, up to 10 KB. Returns `202` with the accepted count, `422` for an invalid event, `413` for a large body. |
| `GET /api/events` | The most recent events held in memory (up to 500), newest first. Used by the dashboard. |
| `GET /dashboard` and `GET /` | The dashboard page. |
| `GET /health` | `{ "ok": true }`. |

When the collector starts it creates the stream if it is missing and reloads recent events from it, so a restart does not blank the dashboard.

## Settings

All optional.

| Variable | Default | Meaning |
| --- | --- | --- |
| `COLLECTOR_PORT` | `8787` | Port the collector listens on (`127.0.0.1` only). |
| `ALLOWED_ORIGIN` | `*` | Value of `Access-Control-Allow-Origin` for `POST /events`. |
| `CLICKSTREAM_STREAM` | `clickstream-events` | Kinesis stream name. |
| `CLICKSTREAM_QUEUE` | `clickstream-processing` | SQS queue name. |
| `CONSUMER_POLL_MS` | `1000` | Consumer wait when the stream is empty. |
| `WORKER_WAIT_SECONDS` | `2` | SQS long-poll time for the worker. |

## Tests

```powershell
npm test
```

The tests cover the three pieces of logic and need neither Docker nor the emulator:

- `src/event.mjs`: `normalizeEvent` validates and cleans a raw browser payload.
- `src/records.mjs`: `decodeRecords` turns Kinesis records into events and skips malformed or repeated ones.
- `src/aggregate.mjs`: `applyTask` folds queue tasks into session summaries and ignores duplicates and malformed tasks.

## Project layout

```text
src/aws.mjs         Kinesis and SQS clients pointed at the emulator
src/server.mjs      Collector, dashboard and feed endpoint
src/event.mjs       Event validation and cleaning
src/consumer.mjs    Kinesis to SQS
src/records.mjs     Decoding and deduplicating Kinesis records
src/worker.mjs      SQS worker
src/aggregate.mjs   Session summaries
src/read.mjs        Print every event in the stream (npm run read)
public/             Dashboard and browser tracker
scripts/            Emulator environment and smoke test
test/               Unit tests
```

## Limits to know about

- AWS Emulator keeps everything in memory. Restarting it clears the stream and the queue.
- The consumer has no checkpoint. On start it replays the whole stream, and the worker's duplicate check by `eventId` keeps the counts right.
- Session summaries live in the worker's memory and are printed to its terminal. The dashboard does not show them yet.
- Delivery is at least once on both Kinesis and SQS, which is why events carry an `eventId` and the worker skips repeats.
- `public/index.html` is an earlier demo page from a previous version and is not served by the current collector.
