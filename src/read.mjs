import { GetRecordsCommand, GetShardIteratorCommand, ListShardsCommand } from "@aws-sdk/client-kinesis";
import { kinesis, streamName } from "./aws.mjs";

const { Shards } = await kinesis.send(new ListShardsCommand({ StreamName: streamName }));
let total = 0;

for (const shard of Shards) {
  const { ShardIterator } = await kinesis.send(
    new GetShardIteratorCommand({
      StreamName: streamName,
      ShardId: shard.ShardId,
      ShardIteratorType: "TRIM_HORIZON"
    })
  );
  let iterator = ShardIterator;
  while (iterator) {
    const result = await kinesis.send(new GetRecordsCommand({ ShardIterator: iterator, Limit: 100 }));
    for (const record of result.Records) {
      console.log(Buffer.from(record.Data).toString("utf8"));
      total += 1;
    }
    if (result.Records.length === 0 || result.MillisBehindLatest === 0) break;
    iterator = result.NextShardIterator;
  }
}

console.error(`${total} event(s) in ${streamName}`);
