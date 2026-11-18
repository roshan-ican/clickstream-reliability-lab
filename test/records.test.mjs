import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeRecords } from "../src/records.mjs";

function record(event) {
  const body = typeof event === "string" ? event : JSON.stringify(event);
  return { Data: new Uint8Array(Buffer.from(body)), SequenceNumber: "1" };
}

const a = { eventId: "a", sessionId: "s1", eventType: "page_view", page: "/" };
const b = { eventId: "b", sessionId: "s1", eventType: "button_click", page: "/" };

test("decodes records into events in order", () => {
  assert.deepEqual(decodeRecords([record(a), record(b)], new Set()), [a, b]);
});

test("returns an empty array for no records", () => {
  assert.deepEqual(decodeRecords([], new Set()), []);
});

test("remembers new eventIds in the seen set", () => {
  const seen = new Set();
  decodeRecords([record(a), record(b)], seen);
  assert.deepEqual([...seen].sort(), ["a", "b"]);
});

test("skips events already seen in an earlier batch", () => {
  const seen = new Set(["a"]);
  assert.deepEqual(decodeRecords([record(a), record(b)], seen), [b]);
});

test("skips duplicates inside the same batch", () => {
  assert.deepEqual(decodeRecords([record(a), record(a), record(b)], new Set()), [a, b]);
});

test("skips malformed JSON without throwing", () => {
  assert.deepEqual(decodeRecords([record("{not json"), record(a)], new Set()), [a]);
});

test("skips payloads without a string eventId", () => {
  const events = decodeRecords([record({ sessionId: "s1" }), record({ eventId: 5 }), record("null"), record(b)], new Set());
  assert.deepEqual(events, [b]);
});
