# Clickstream Reliability Lab

A local-first cloud engineering lab for a small website analytics pipeline. The business problem is reliable clickstream capture: a site owner needs to see what visitors do and where they drop off, while the ingestion system handles retries and background processing without silently losing events.

## First milestone: verify the local AWS APIs

The local demo website and Node.js collector are scaffolded. The collector sends browser clicks to Kinesis; a stream consumer forwards events to SQS; a worker aggregates them for the live summary panel. Before relying on that flow, this smoke test checks the exact APIs the project needs:

- Kinesis: create stream, write a click event, find a shard, and read the event back.
- SQS: create a queue, enqueue a processing task, receive it, acknowledge it, and delete the queue.

AWS Emulator keeps resources in memory, so each run starts clean. Its API behavior varies by operation; a `501 NotImplemented` means that operation is not available in the emulator build being used.

## Start AWS Emulator on Windows

Docker Desktop must be running. In PowerShell, from this folder:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.aws\emulator" | Out-Null
docker compose -f compose.yaml up --build
```

Leave that terminal open. The emulator is exposed only on `127.0.0.1:9297`.

In a second PowerShell terminal, set the emulator files and run the smoke test:

```powershell
.\scripts\smoke-test.ps1
```

The script uses emulator-generated credentials and the emulator CA certificate. It cleans up the temporary stream and queue when it finishes. Do not use real AWS credentials for this local test.

## Run the demo after the smoke test passes

Install the Node.js dependencies once:

```powershell
npm install
$env:AWS_ENDPOINT_URL = "https://127.0.0.1:9297"
$env:AWS_SHARED_CREDENTIALS_FILE = "$env:USERPROFILE\.aws\emulator\9297\emulator_credentials"
$env:AWS_CA_BUNDLE = "$env:USERPROFILE\.aws\emulator\9297\ca.pem"
$env:AWS_REGION = "us-east-1"
npm start
```

Open `http://127.0.0.1:3100` and click either button. The dashboard updates as the consumer and worker process the event.

## Track the local portfolio

The collector serves a small browser tracker at `http://127.0.0.1:3100/tracker.js`. To load it only in local development, add this to `my-portfolio/.env.local`:

```text
NEXT_PUBLIC_CLICKSTREAM_URL=http://127.0.0.1:3100
```

In `src/app/layout.tsx`, define `const CLICKSTREAM_URL = process.env.NEXT_PUBLIC_CLICKSTREAM_URL;` near the existing `GA_ID` constant. Then, after `{children}` inside `<body>`, add:

```tsx
{CLICKSTREAM_URL && (
  <Script src={`${CLICKSTREAM_URL}/tracker.js`} strategy="afterInteractive" />
)}
```

Restart the portfolio dev server after editing `.env.local`. Open the portfolio at `http://localhost:3000` and the clickstream dashboard at `http://127.0.0.1:3100`. Clicks on links and buttons appear in the dashboard and collector terminal. The tracker sends only the target label, page path, and a session ID.

## Planned application flow

```text
Local demo website -> event collector -> Kinesis -> stream consumer -> SQS work queue -> analytics worker -> funnel dashboard
```

The browser sends events only to the collector; AWS credentials never go into the page. Kinesis holds the event stream. SQS is for decoupled processing jobs and retries, not a duplicate copy of every click.

## Event shape

```json
{
  "eventId": "uuid",
  "eventType": "button_click",
  "page": "/pricing",
  "target": "start-trial",
  "sessionId": "anonymous-session-id",
  "occurredAt": "2026-11-18T10:00:00.000Z"
}
```

Keep the demo data anonymous: do not capture typed form values, passwords, emails, or other personal information.
