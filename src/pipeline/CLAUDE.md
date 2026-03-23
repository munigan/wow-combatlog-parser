# Pipeline Layer

Transforms raw bytes into structured `LogEvent` objects. Stateless — no buffering beyond a single partial line.

## Files

### line-splitter.ts
`LineSplitter` — `TransformStream<string, string>` that splits text into individual lines. Handles `\n` and `\r\n`, buffers partial chunks across calls, skips empty lines.

Used after `TextDecoderStream` in both `scanLog` and `parseLog` pipelines.

### line-parser.ts
`parseLine(raw, year)` — Parses a single WoW combat log line into a `LogEvent`.

**Log line format**: `M/D HH:MM:SS.mmm  EVENT_TYPE,field1,field2,...` (note: double-space separator between timestamp and event data).

**`LogEvent` fields**: `timestamp` (epoch ms), `eventType`, `sourceGuid`, `sourceName`, `destGuid`, `destName`, `rawFields` (remaining CSV fields after the 6 standard ones).

**Helper exports**:
- `getSpellId(event)` — extracts spell ID from `rawFields[0]` for spell events. Returns `null` for SWING/ENVIRONMENTAL events.
- `isBuffAura(event)` — returns `true` if the last raw field is `"BUFF"`. Used by encounter-tracker to skip BUFF auras from starting encounters.

**Performance**: Uses `charCodeAt()` for field parsing and `indexOf()` for the double-space separator. No regex.
