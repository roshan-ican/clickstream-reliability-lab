import { randomUUID } from "node:crypto";

export const ALLOWED_TYPES = new Set(["page_view", "button_click", "link_click", "scroll_depth"]);
export const MAX_FIELD_LENGTH = 200;


function cleanString(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_FIELD_LENGTH);
}

function requireString(value, name) {
  const cleaned = cleanString(value);
  if (!cleaned) throw new Error(`Missing or empty required field: ${name}`);
  return cleaned;
}

function parseTime(value, fallback) {
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  return isNaN(date.getTime()) ? fallback : date;
}



export function normalizeEvent(raw, now = new Date()) {
  // TODO(you): validate and clean the raw browser payload, see test/event.test.mjs
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid event payload");
  }
  const eventType = cleanString(raw.eventType);
  if (!ALLOWED_TYPES.has(eventType)) {
    throw new Error(`Invalid event type: ${eventType}`);
  }
  return {
    eventId: cleanString(raw.eventId) || randomUUID(),
    eventType,
    page: requireString(raw.page, "page"),
    target: cleanString(raw.target),
    sessionId: requireString(raw.sessionId, "sessionId"),
    occurredAt: parseTime(raw.occurredAt, now).toISOString(),
    receivedAt: now.toISOString()
  }
}
