// src/pipeline/line-parser.ts
import { parseTimestampToEpoch } from "../utils/timestamp.js";
import { parseFields } from "../utils/fields.js";

export interface LogEvent {
  /** Epoch milliseconds (UTC) */
  timestamp: number;
  /** Raw date string, e.g. "3/5" */
  date: string;
  /** Raw time string, e.g. "20:03:31.449" */
  time: string;
  /** Event type, e.g. "SPELL_DAMAGE" */
  eventType: string;
  /** Source unit GUID */
  sourceGuid: string;
  /** Source unit name (quotes stripped) */
  sourceName: string;
  /** Source unit flags (hex string) */
  sourceFlags: string;
  /** Destination unit GUID */
  destGuid: string;
  /** Destination unit name (quotes stripped) */
  destName: string;
  /** Destination unit flags (hex string) */
  destFlags: string;
  /** Remaining unparsed fields after the common prefix (comma-joined) */
  rawFields: string;
}

/**
 * Parse a raw WoW combat log line into a structured LogEvent.
 * Returns null if the line is malformed.
 *
 * Line format: "M/D HH:MM:SS.mmm  EVENT_TYPE,field1,field2,..."
 * The timestamp and event data are separated by two spaces.
 */
export function parseLine(raw: string, year: number): LogEvent | null {
  // Find the double-space separator between timestamp and event data
  const separatorIdx = raw.indexOf("  ");
  if (separatorIdx === -1 || separatorIdx < 5) return null;

  const timestampRaw = raw.substring(0, separatorIdx);
  const eventData = raw.substring(separatorIdx + 2);

  if (eventData.length === 0) return null;

  // Parse timestamp
  const spaceIdx = timestampRaw.indexOf(" ");
  if (spaceIdx === -1) return null;

  const date = timestampRaw.substring(0, spaceIdx);
  const time = timestampRaw.substring(spaceIdx + 1);

  let timestamp: number;
  try {
    timestamp = parseTimestampToEpoch(timestampRaw, year);
  } catch {
    return null;
  }

  // Parse the event fields with quote-aware parsing
  const fields = parseFields(eventData);

  // We need at least 7 fields: eventType, srcGUID, srcName, srcFlags, dstGUID, dstName, dstFlags
  if (fields.length < 7) return null;

  const eventType = fields[0];
  const sourceGuid = fields[1];
  const sourceName = fields[2];
  const sourceFlags = fields[3];
  const destGuid = fields[4];
  const destName = fields[5];
  const destFlags = fields[6];

  // Everything after the 7th field is rawFields
  const rawFields = fields.length > 7 ? fields.slice(7).join(",") : "";

  return {
    timestamp,
    date,
    time,
    eventType,
    sourceGuid,
    sourceName,
    sourceFlags,
    destGuid,
    destName,
    destFlags,
    rawFields,
  };
}

/**
 * Extract spell ID from rawFields.
 * For spell events, the first field in rawFields is the spell ID.
 * For SWING events, there is no spell ID.
 */
export function getSpellId(event: LogEvent): string | null {
  if (event.eventType.startsWith("SWING_") || event.eventType === "ENVIRONMENTAL_DAMAGE") {
    return null;
  }
  if (event.rawFields.length === 0) return null;
  const commaIdx = event.rawFields.indexOf(",");
  return commaIdx === -1 ? event.rawFields : event.rawFields.substring(0, commaIdx);
}

/**
 * Check if an aura event has a BUFF aura type.
 * For SPELL_AURA_* events, rawFields ends with ",BUFF" or ",DEBUFF".
 * Returns true if the aura type is BUFF, false otherwise.
 */
export function isBuffAura(event: LogEvent): boolean {
  return event.rawFields.endsWith(",BUFF");
}
