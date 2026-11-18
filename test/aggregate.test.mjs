import { test } from "node:test";
import assert from "node:assert/strict";
import { createState, applyTask } from "../src/aggregate.mjs";

function task(overrides = {}) {
  return {
    task: "aggregate-session",
    eventId: "e1",
    sessionId: "s1",
    eventType: "page_view",
    page: "/",
    target: "Home",
    occurredAt: "2026-11-18T10:00:00.000Z",
    ...overrides
  };
}

test("creates a summary for a new session and reports it applied", () => {
  const state = createState();
  assert.equal(applyTask(state, task()), true);
  assert.deepEqual(state.sessions.get("s1"), {
    sessionId: "s1",
    startedAt: "2026-11-18T10:00:00.000Z",
    lastEventAt: "2026-11-18T10:00:00.000Z",
    events: 1,
    pageViews: 1,
    clicks: 0,
    pages: ["/"]
  });
});

test("counts button and link clicks but not scrolls as clicks", () => {
  const state = createState();
  applyTask(state, task({ eventId: "a", eventType: "button_click" }));
  applyTask(state, task({ eventId: "b", eventType: "link_click" }));
  applyTask(state, task({ eventId: "c", eventType: "scroll_depth" }));
  const summary = state.sessions.get("s1");
  assert.equal(summary.events, 3);
  assert.equal(summary.clicks, 2);
  assert.equal(summary.pageViews, 0);
});

test("tracks the earliest and latest time even when events arrive out of order", () => {
  const state = createState();
  applyTask(state, task({ eventId: "a", occurredAt: "2026-11-18T10:05:00.000Z" }));
  applyTask(state, task({ eventId: "b", occurredAt: "2026-11-18T10:00:00.000Z" }));
  applyTask(state, task({ eventId: "c", occurredAt: "2026-11-18T10:02:00.000Z" }));
  const summary = state.sessions.get("s1");
  assert.equal(summary.startedAt, "2026-11-18T10:00:00.000Z");
  assert.equal(summary.lastEventAt, "2026-11-18T10:05:00.000Z");
});

test("lists each page once, in the order first seen", () => {
  const state = createState();
  applyTask(state, task({ eventId: "a", page: "/" }));
  applyTask(state, task({ eventId: "b", page: "/work" }));
  applyTask(state, task({ eventId: "c", page: "/" }));
  assert.deepEqual(state.sessions.get("s1").pages, ["/", "/work"]);
});

test("ignores a task it has already applied", () => {
  const state = createState();
  assert.equal(applyTask(state, task({ eventType: "button_click" })), true);
  assert.equal(applyTask(state, task({ eventType: "button_click" })), false);
  const summary = state.sessions.get("s1");
  assert.equal(summary.events, 1);
  assert.equal(summary.clicks, 1);
});

test("keeps sessions separate", () => {
  const state = createState();
  applyTask(state, task({ eventId: "a", sessionId: "s1" }));
  applyTask(state, task({ eventId: "b", sessionId: "s2", eventType: "button_click" }));
  assert.equal(state.sessions.size, 2);
  assert.equal(state.sessions.get("s1").clicks, 0);
  assert.equal(state.sessions.get("s2").clicks, 1);
});

test("rejects malformed tasks without throwing or creating a session", () => {
  for (const field of ["eventId", "sessionId", "eventType", "page", "occurredAt"]) {
    const state = createState();
    assert.equal(applyTask(state, task({ [field]: undefined })), false);
    assert.equal(state.sessions.size, 0);
  }
  const state = createState();
  assert.equal(applyTask(state, null), false);
  assert.equal(applyTask(state, "nope"), false);
  assert.equal(state.sessions.size, 0);
});

test("a rejected task does not use up its eventId", () => {
  const state = createState();
  applyTask(state, task({ page: undefined }));
  assert.equal(applyTask(state, task()), true);
});
