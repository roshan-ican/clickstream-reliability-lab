import { GetRecordsCommand, GetShardIteratorCommand, ListShardsCommand } from "@aws-sdk/client-kinesis";
import { CreateQueueCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import { kinesis, sqs, streamName, queueName } from "./aws.mjs";
import { decodeRecords } from "./records.mjs";

const pollIntervalMs = Number(process.env.CONSUMER_POLL_MS ?? 1000);
const seen = new Set();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForShards() {
  for (;;) {
    try {
      const { Shards } = await kinesis.send(new ListShardsCommand({ StreamName: streamName }));
      if (Shards?.length) return Shards;
    } catch (error) {
      if (error.name !== "ResourceNotFoundException") throw error;
    }
    console.log(`Waiting for stream ${streamName}...`);
    await sleep(pollIntervalMs);
  }
}

async function pollShard(shardId, queueUrl) {
  const start = await kinesis.send(
    new GetShardIteratorCommand({ StreamName: streamName, ShardId: shardId, ShardIteratorType: "TRIM_HORIZON" })
  );
  let iterator = start.ShardIterator;

  while (iterator) {
    const result = await kinesis.send(new GetRecordsCommand({ ShardIterator: iterator, Limit: 100 }));
    const events = decodeRecords(result.Records, seen);

    for (const event of events) {
      const body = JSON.stringify({
        task: "aggregate-session",
        eventId: event.eventId,
        sessionId: event.sessionId,
        eventType: event.eventType,
        page: event.page,
        target: event.target,
        occurredAt: event.occurredAt
      });
      await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body }));
      console.log(`queued ${event.eventType} ${event.eventId}`);
    }

    iterator = result.NextShardIterator;
    if (result.Records.length === 0) await sleep(pollIntervalMs);
  }
}

const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: queueName }));
const shards = await waitForShards();
console.log(`Consuming ${shards.length} shard(s) of ${streamName} -> ${queueName}`);
await Promise.all(shards.map((shard) => pollShard(shard.ShardId, QueueUrl)));
