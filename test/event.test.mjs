import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEvent, MAX_FIELD_LENGTH } from "../src/event.mjs";

const now = new Date("2026-11-18T10:00:00.000Z");

const valid = {
  eventId: "evt-1",
  eventType: "button_click",
  page: "/projects",
  target: "contact-cta",
  sessionId: "sess-1",
  occurredAt: "2026-11-18T09:59:59.000Z"
};

test("keeps a valid event and stamps receivedAt", () => {
  const event = normalizeEvent(valid, now);
  assert.deepEqual(event, { ...valid, receivedAt: now.toISOString() });
});

test("generates an eventId when missing", () => {
  const { eventId, ...rest } = valid;
  const event = normalizeEvent(rest, now);
  assert.equal(typeof event.eventId, "string");
  assert.ok(event.eventId.length > 0);
});

test("rejects an unknown eventType", () => {
  assert.throws(() => normalizeEvent({ ...valid, eventType: "hack" }, now));
});

test("rejects a missing page or sessionId", () => {
  assert.throws(() => normalizeEvent({ ...valid, page: undefined }, now));
  assert.throws(() => normalizeEvent({ ...valid, sessionId: "" }, now));
});

test("rejects a non-object payload", () => {
  assert.throws(() => normalizeEvent(null, now));
  assert.throws(() => normalizeEvent("click", now));
});

test("truncates long strings", () => {
  const event = normalizeEvent({ ...valid, target: "x".repeat(MAX_FIELD_LENGTH + 50) }, now);
  assert.equal(event.target.length, MAX_FIELD_LENGTH);
});

test("drops unknown fields", () => {
  const event = normalizeEvent({ ...valid, password: "secret" }, now);
  assert.equal("password" in event, false);
});

test("falls back to now when occurredAt is invalid", () => {
  const event = normalizeEvent({ ...valid, occurredAt: "not-a-date" }, now);
  assert.equal(event.occurredAt, now.toISOString());
});

test("target is optional and defaults to empty string", () => {
  const { target, ...rest } = valid;
  assert.equal(normalizeEvent(rest, now).target, "");
});
