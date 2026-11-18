export function createState() {
  return { sessions: new Map(), seen: new Set() };
}

const CLICK_TYPES = new Set(["button_click", "link_click"]);
const REQUIRED_FIELDS = ["eventId", "sessionId", "eventType", "page", "occurredAt"];

function isValidTask(task) {
  if (task === null || typeof task !== "object") return false;
  const hasAllFields = REQUIRED_FIELDS.every((field) => typeof task[field] === "string" && task[field] !== "");
  return hasAllFields && !Number.isNaN(Date.parse(task.occurredAt));
}

function newSummary(task) {
  return {
    sessionId: task.sessionId,
    startedAt: task.occurredAt,
    lastEventAt: task.occurredAt,
    events: 0,
    pageViews: 0,
    clicks: 0,
    pages: []
  };
}

export function applyTask(state, task) {
  if (!isValidTask(task) || state.seen.has(task.eventId)) return false;

  let summary = state.sessions.get(task.sessionId);
  if (!summary) {
    summary = newSummary(task);
    state.sessions.set(task.sessionId, summary);
  }

  summary.events += 1;
  if (task.eventType === "page_view") summary.pageViews += 1;
  if (CLICK_TYPES.has(task.eventType)) summary.clicks += 1;
  if (!summary.pages.includes(task.page)) summary.pages.push(task.page);

  const time = Date.parse(task.occurredAt);
  if (time < Date.parse(summary.startedAt)) summary.startedAt = task.occurredAt;
  if (time > Date.parse(summary.lastEventAt)) summary.lastEventAt = task.occurredAt;

  state.seen.add(task.eventId);
  return true;
}