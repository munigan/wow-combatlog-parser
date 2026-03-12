// src/utils/timestamp.ts

export interface ParsedTimestamp {
  date: string; // raw "M/D"
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

/**
 * Parse a WoW combat log timestamp string "M/D HH:MM:SS.mmm"
 * Uses fast string slicing, no regex.
 */
export function parseTimestamp(raw: string): ParsedTimestamp {
  const slashIdx = raw.indexOf("/");
  const spaceIdx = raw.indexOf(" ", slashIdx);

  const month = parseInt(raw.substring(0, slashIdx), 10);
  const day = parseInt(raw.substring(slashIdx + 1, spaceIdx), 10);

  const timeStart = spaceIdx + 1;
  const hours = parseInt(raw.substring(timeStart, timeStart + 2), 10);
  const minutes = parseInt(raw.substring(timeStart + 3, timeStart + 5), 10);
  const seconds = parseInt(raw.substring(timeStart + 6, timeStart + 8), 10);
  const milliseconds = parseInt(raw.substring(timeStart + 9, timeStart + 12), 10);

  return { date: raw.substring(0, spaceIdx), month, day, hours, minutes, seconds, milliseconds };
}

/**
 * Convert a raw timestamp string to epoch milliseconds (UTC).
 */
export function parseTimestampToEpoch(raw: string, year: number): number {
  const ts = parseTimestamp(raw);
  return Date.UTC(year, ts.month - 1, ts.day, ts.hours, ts.minutes, ts.seconds, ts.milliseconds);
}

/** Convert epoch ms to ISO-8601 string. */
export function epochToIso(epoch: number): string {
  return new Date(epoch).toISOString();
}
