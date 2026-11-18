import { CreateQueueCommand, DeleteMessageCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import { sqs, queueName } from "./aws.mjs";
import { applyTask, createState } from "./aggregate.mjs";

const waitSeconds = Number(process.env.WORKER_WAIT_SECONDS ?? 2);
const state = createState();
let running = true;

process.on("SIGINT", () => {
  running = false;
});

function parse(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function describe(summary) {
  return `${summary.sessionId}: ${summary.events} events, ${summary.pageViews} page views, ${summary.clicks} clicks, ${summary.pages.length} pages`;
}

function printSummaries() {
  console.log(`\n${state.sessions.size} session(s):`);
  for (const summary of state.sessions.values()) console.log(`  ${describe(summary)}`);
}

const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: queueName }));
console.log(`Working ${queueName}. Press Ctrl+C to stop and print the sessions.`);

while (running) {
  const { Messages = [] } = await sqs.send(
    new ReceiveMessageCommand({ QueueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: waitSeconds })
  );

  for (const message of Messages) {
    const task = parse(message.Body);
    const applied = applyTask(state, task);
    if (applied) console.log(`applied ${task.eventType} -> ${describe(state.sessions.get(task.sessionId))}`);
    else console.log(`skipped ${task?.eventId ?? "unreadable message"}`);
    await sqs.send(new DeleteMessageCommand({ QueueUrl, ReceiptHandle: message.ReceiptHandle }));
  }
}

printSummaries();
