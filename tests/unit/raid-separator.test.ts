import { describe, it, expect, beforeEach } from "vitest";
import {
  RaidSeparator,
  SEGMENT_GAP_MS,
} from "../../src/state/raid-separator.js";

describe("RaidSeparator", () => {
  let separator: RaidSeparator;

  beforeEach(() => {
    separator = new RaidSeparator();
  });

  it("starts with no current segment", () => {
    expect(separator.getCurrentSegment()).toBeNull();
  });

  it("creates initial segment on first event", () => {
    const result = separator.processTimestamp(
      1000000,
      "3/5",
      "0x0E00000000000001",
      null,
    );

    expect(result.newSegment).toBe(true);
    expect(result.completedSegment).toBeNull();

    const seg = separator.getCurrentSegment();
    expect(seg).not.toBeNull();
    expect(seg!.date).toBe("3/5");
    expect(seg!.firstTimestamp).toBe(1000000);
    expect(seg!.lastTimestamp).toBe(1000000);
    expect(seg!.playerGuids.has("0x0E00000000000001")).toBe(true);
    expect(seg!.raidInstance).toBeNull();
  });

  it("updates current segment for same-date, within-gap events", () => {
    separator.processTimestamp(1000000, "3/5", "0x0E00000000000001", null);

    const result = separator.processTimestamp(
      1005000,
      "3/5",
      "0x0E00000000000002",
      null,
    );

    expect(result.newSegment).toBe(false);
    expect(result.completedSegment).toBeNull();

    const seg = separator.getCurrentSegment()!;
    expect(seg.lastTimestamp).toBe(1005000);
    expect(seg.playerGuids.size).toBe(2);
  });

  it("creates new segment on date change", () => {
    separator.processTimestamp(1000000, "3/5", "0x0E00000000000001", null);

    const result = separator.processTimestamp(
      1005000,
      "3/6",
      "0x0E00000000000001",
      null,
    );

    expect(result.newSegment).toBe(true);
    expect(result.completedSegment).not.toBeNull();
    expect(result.completedSegment!.date).toBe("3/5");

    const current = separator.getCurrentSegment()!;
    expect(current.date).toBe("3/6");
  });

  it("creates new segment on 30+ minute gap", () => {
    const startTs = 1000000;
    separator.processTimestamp(startTs, "3/5", "0x0E00000000000001", null);

    const result = separator.processTimestamp(
      startTs + SEGMENT_GAP_MS,
      "3/5",
      "0x0E00000000000001",
      null,
    );

    expect(result.newSegment).toBe(true);
    expect(result.completedSegment).not.toBeNull();
    expect(result.completedSegment!.firstTimestamp).toBe(startTs);
  });

  it("does NOT create new segment on small gap", () => {
    const startTs = 1000000;
    separator.processTimestamp(startTs, "3/5", "0x0E00000000000001", null);

    const result = separator.processTimestamp(
      startTs + SEGMENT_GAP_MS - 1,
      "3/5",
      "0x0E00000000000001",
      null,
    );

    expect(result.newSegment).toBe(false);
  });

  it("creates new segment when raid instance changes", () => {
    separator.processTimestamp(
      1000000,
      "3/5",
      "0x0E00000000000001",
      "Naxxramas",
    );

    const result = separator.processTimestamp(
      1005000,
      "3/5",
      "0x0E00000000000001",
      "Ulduar",
    );

    expect(result.newSegment).toBe(true);
    expect(result.completedSegment!.raidInstance).toBe("Naxxramas");
    expect(separator.getCurrentSegment()!.raidInstance).toBe("Ulduar");
  });

  it("does NOT split segment when first instance is null and second is set", () => {
    separator.processTimestamp(1000000, "3/5", "0x0E00000000000001", null);

    const result = separator.processTimestamp(
      1005000,
      "3/5",
      "0x0E00000000000001",
      "Naxxramas",
    );

    expect(result.newSegment).toBe(false);
    expect(separator.getCurrentSegment()!.raidInstance).toBe("Naxxramas");
  });

  it("tracks player GUIDs in segments", () => {
    separator.processTimestamp(1000000, "3/5", "0x0E00000000000001", null);
    separator.processTimestamp(1001000, "3/5", "0x0E00000000000002", null);
    separator.processTimestamp(1002000, "3/5", "0x0E00000000000003", null);
    separator.processTimestamp(1003000, "3/5", null, null); // null GUID not added

    const seg = separator.getCurrentSegment()!;
    expect(seg.playerGuids.size).toBe(3);
  });

  describe("finalize", () => {
    it("returns empty array when no events processed", () => {
      expect(separator.finalize()).toEqual([]);
    });

    it("returns single segment when only one exists", () => {
      separator.processTimestamp(1000000, "3/5", "0x0E00000000000001", null);
      const segments = separator.finalize();
      expect(segments.length).toBe(1);
      expect(segments[0].date).toBe("3/5");
    });

    it("merges adjacent segments with high player overlap and same instance", () => {
      const p1 = "0x0E00000000000001";
      const p2 = "0x0E00000000000002";
      const p3 = "0x0E00000000000003";

      // Segment 1: players 1, 2, 3
      separator.processTimestamp(1000000, "3/5", p1, "Naxxramas");
      separator.processTimestamp(1001000, "3/5", p2, "Naxxramas");
      separator.processTimestamp(1002000, "3/5", p3, "Naxxramas");

      // Gap causes new segment — same players 1, 2 (Jaccard: 2 / 3 = 0.67 >= 0.5)
      separator.processTimestamp(
        1000000 + SEGMENT_GAP_MS,
        "3/5",
        p1,
        "Naxxramas",
      );
      separator.processTimestamp(
        1000000 + SEGMENT_GAP_MS + 1000,
        "3/5",
        p2,
        "Naxxramas",
      );

      const segments = separator.finalize();
      // Should merge into a single segment
      expect(segments.length).toBe(1);
      expect(segments[0].playerGuids.size).toBe(3);
      expect(segments[0].raidInstance).toBe("Naxxramas");
    });

    it("does NOT merge segments with different raid instances", () => {
      const p1 = "0x0E00000000000001";

      // Segment 1: Naxxramas
      separator.processTimestamp(1000000, "3/5", p1, "Naxxramas");

      // Segment 2 (new instance): Ulduar
      separator.processTimestamp(1005000, "3/5", p1, "Ulduar");

      const segments = separator.finalize();
      expect(segments.length).toBe(2);
    });

    it("does NOT merge segments with low player overlap", () => {
      const baseTs = 1000000;

      // Segment 1: players 1, 2, 3, 4
      separator.processTimestamp(baseTs, "3/5", "0x0E00000000000001", null);
      separator.processTimestamp(baseTs + 1000, "3/5", "0x0E00000000000002", null);
      separator.processTimestamp(baseTs + 2000, "3/5", "0x0E00000000000003", null);
      separator.processTimestamp(baseTs + 3000, "3/5", "0x0E00000000000004", null);

      // Gap from last event (baseTs + 3000) must be >= SEGMENT_GAP_MS
      const seg2Start = baseTs + 3000 + SEGMENT_GAP_MS;

      // Segment 2: completely different players 5, 6, 7, 8
      // Jaccard = 0 / 8 = 0 < 0.5
      separator.processTimestamp(seg2Start, "3/5", "0x0E00000000000005", null);
      separator.processTimestamp(seg2Start + 1000, "3/5", "0x0E00000000000006", null);
      separator.processTimestamp(seg2Start + 2000, "3/5", "0x0E00000000000007", null);
      separator.processTimestamp(seg2Start + 3000, "3/5", "0x0E00000000000008", null);

      const segments = separator.finalize();
      expect(segments.length).toBe(2);
    });
  });
});
