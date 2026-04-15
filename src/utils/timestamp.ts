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

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
}

/**
 * Every WoW log date string (`M/D`) whose UTC calendar day intersects
 * `[startMs, endMs]` (inclusive). Matches {@link parseTimestampToEpoch} so
 * `parseLog` line rejection stays aligned with `event.date`.
 */
export function enumerateWowLogDatesBetween(startMs: number, endMs: number): string[] {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
    return [];
  }
  const dates: string[] = [];
  let dayStart = startOfUtcDay(startMs);
  while (dayStart <= endMs) {
    const d = new Date(dayStart);
    dates.push(`${d.getUTCMonth() + 1}/${d.getUTCDate()}`);
    const next = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    );
    if (next <= dayStart) break;
    dayStart = next;
  }
  return dates;
}

/**
 * Parse a WoW log `M/D` string into a local calendar {@link Date} (legacy behavior
 * for raid display metadata).
 */
export function parseWowCalendarDate(dateStr: string, year: number): Date {
  const slashIdx = dateStr.indexOf("/");
  if (slashIdx === -1) return new Date(year, 0, 1);
  const month = parseInt(dateStr.substring(0, slashIdx), 10);
  const day = parseInt(dateStr.substring(slashIdx + 1), 10);
  return new Date(year, month - 1, day);
}

/** Earliest calendar date among selection strings (for `raidDate` metadata). */
export function earliestWowCalendarDateInSelection(dates: string[], year: number): Date {
  if (dates.length === 0) return new Date(year, 0, 1);
  let best = parseWowCalendarDate(dates[0], year);
  for (let i = 1; i < dates.length; i++) {
    const d = parseWowCalendarDate(dates[i], year);
    if (d < best) best = d;
  }
  return best;
}
