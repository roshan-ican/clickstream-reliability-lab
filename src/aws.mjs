import { readFileSync } from "node:fs";
import https from "node:https";
import { fromIni } from "@aws-sdk/credential-providers";
import { KinesisClient } from "@aws-sdk/client-kinesis";
import { SQSClient } from "@aws-sdk/client-sqs";
import { NodeHttpHandler } from "@smithy/node-http-handler";

const caPath = process.env.AWS_CA_BUNDLE;
const credentialsPath = process.env.AWS_SHARED_CREDENTIALS_FILE;
if (!caPath || !credentialsPath) {
  throw new Error("Start AWS Emulator and set AWS_CA_BUNDLE and AWS_SHARED_CREDENTIALS_FILE.");
}

const common = {
  endpoint: process.env.AWS_ENDPOINT_URL ?? "https://127.0.0.1:9297",
  region: process.env.AWS_REGION ?? "us-east-1",
  credentials: fromIni({ filepath: credentialsPath }),
  requestHandler: new NodeHttpHandler({ httpsAgent: new https.Agent({ ca: readFileSync(caPath) }) })
};

export const kinesis = new KinesisClient(common);
export const sqs = new SQSClient(common);
export const streamName = process.env.CLICKSTREAM_STREAM ?? "clickstream-events";
export const queueName = process.env.CLICKSTREAM_QUEUE ?? "clickstream-processing";
