function decodeRecord(record) {
  try {
    const text = Buffer.from(record.Data).toString("utf8")
    const event = JSON.parse(text)
    if (event === null || typeof event !== "object") return null
    if (typeof event.eventId !== "string" || event.eventId === "") return null
    return event
  } catch (error) {
    return null
  }
}


export function decodeRecords(records, seen) {
  const events = []
  for (const record of records) {
    const event = decodeRecord(record)
    if (!event || seen.has(event.eventId)) continue
    seen.add(event.eventId)
    events.push(event)
  }
  return events
}