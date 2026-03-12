// src/state/raid-separator.ts

/** Time gap (ms) that triggers a new segment. */
export const SEGMENT_GAP_MS = 30 * 60 * 1000; // 30 minutes

export interface RaidSegment {
  date: string;
  firstTimestamp: number;
  lastTimestamp: number;
  playerGuids: Set<string>;
  raidInstance: string | null;
}

export interface SegmentProcessResult {
  newSegment: boolean;
  completedSegment: RaidSegment | null;
}

/** Jaccard similarity threshold for merging adjacent segments. */
const MERGE_SIMILARITY_THRESHOLD = 0.5;

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersectionSize = 0;
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  for (const item of smaller) {
    if (larger.has(item)) intersectionSize++;
  }
  const unionSize = a.size + b.size - intersectionSize;
  return unionSize === 0 ? 1 : intersectionSize / unionSize;
}

export class RaidSeparator {
  private _current: RaidSegment | null = null;
  private _completed: RaidSegment[] = [];

  getCurrentSegment(): RaidSegment | null {
    return this._current;
  }

  processTimestamp(
    timestamp: number,
    date: string,
    playerGuid: string | null,
    raidInstance: string | null,
  ): SegmentProcessResult {
    const result: SegmentProcessResult = {
      newSegment: false,
      completedSegment: null,
    };

    if (this._current === null) {
      // First event — create initial segment
      this._current = this._createSegment(timestamp, date, raidInstance);
      if (playerGuid !== null) {
        this._current.playerGuids.add(playerGuid);
      }
      result.newSegment = true;
      return result;
    }

    // Check if we need a new segment
    const needsNewSegment =
      date !== this._current.date ||
      timestamp - this._current.lastTimestamp >= SEGMENT_GAP_MS ||
      (raidInstance !== null &&
        this._current.raidInstance !== null &&
        raidInstance !== this._current.raidInstance);

    if (needsNewSegment) {
      // Complete current segment and start a new one
      result.completedSegment = this._current;
      this._completed.push(this._current);

      this._current = this._createSegment(timestamp, date, raidInstance);
      result.newSegment = true;
    } else {
      // Update current segment
      this._current.lastTimestamp = timestamp;
      if (raidInstance !== null && this._current.raidInstance === null) {
        this._current.raidInstance = raidInstance;
      }
    }

    if (playerGuid !== null) {
      this._current.playerGuids.add(playerGuid);
    }

    return result;
  }

  /**
   * Finalize and return all segments, merging adjacent ones
   * with similar player composition and the same raid instance.
   */
  finalize(): RaidSegment[] {
    const allSegments = [...this._completed];
    if (this._current !== null) {
      allSegments.push(this._current);
    }

    if (allSegments.length <= 1) return allSegments;

    // Merge adjacent segments with high player overlap and same raid instance
    const merged: RaidSegment[] = [allSegments[0]];

    for (let i = 1; i < allSegments.length; i++) {
      const prev = merged[merged.length - 1];
      const curr = allSegments[i];

      const sameInstance =
        prev.raidInstance === curr.raidInstance ||
        prev.raidInstance === null ||
        curr.raidInstance === null;

      const similarity = jaccardSimilarity(prev.playerGuids, curr.playerGuids);

      if (sameInstance && similarity >= MERGE_SIMILARITY_THRESHOLD) {
        // Merge: extend previous segment
        prev.lastTimestamp = curr.lastTimestamp;
        for (const guid of curr.playerGuids) {
          prev.playerGuids.add(guid);
        }
        if (prev.raidInstance === null && curr.raidInstance !== null) {
          prev.raidInstance = curr.raidInstance;
        }
      } else {
        merged.push(curr);
      }
    }

    return merged;
  }

  private _createSegment(
    timestamp: number,
    date: string,
    raidInstance: string | null,
  ): RaidSegment {
    return {
      date,
      firstTimestamp: timestamp,
      lastTimestamp: timestamp,
      playerGuids: new Set(),
      raidInstance,
    };
  }
}
