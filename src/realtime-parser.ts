import { parseLine } from "./pipeline/line-parser.js";
import { CombatLogStateMachine } from "./state/state-machine.js";
import type {
	ActiveEncounterInfo,
	EncounterPlayer,
	EncounterStartInfo,
	ParsedEncounter,
	PlayerInfo,
	RealtimeParser,
	RealtimeParserOptions,
} from "./types.js";

const MIN_ENCOUNTER_DURATION_S = 10;

export function createRealtimeParser(
	opts?: RealtimeParserOptions,
): RealtimeParser {
	const year = opts?.year ?? new Date().getFullYear();
	const sm = new CombatLogStateMachine(true);

	const encounterStartCbs: Array<(info: EncounterStartInfo) => void> = [];
	const encounterEndCbs: Array<(encounter: ParsedEncounter) => void> = [];
	const playerDetectedCbs: Array<(player: PlayerInfo) => void> = [];

	const knownPlayerGuids = new Set<string>();
	let lastEventTimestamp = 0;
	let wallClockAtLastEvent = 0;
	let encounterStartTime = 0;
	let encounterBossName: string | null = null;
	let encounterRaidInstance: string | null = null;
	let isDestroyed = false;

	function checkForNewPlayers(): void {
		const players = sm.getDetectedPlayers();
		for (const [guid, record] of players) {
			if (!knownPlayerGuids.has(guid)) {
				knownPlayerGuids.add(guid);
				const playerInfo: PlayerInfo = {
					guid: record.guid,
					name: record.name,
					class: record.class,
					spec: record.spec,
				};
				for (const cb of playerDetectedCbs) cb(playerInfo);
			}
		}
	}

	function checkForEncounterStart(): void {
		const tracker = sm.getEncounterTracker();
		if (tracker.isInEncounter() && encounterBossName === null) {
			const bossName = tracker.getCurrentBossName()!;
			encounterBossName = bossName;
			encounterStartTime = lastEventTimestamp;
			encounterRaidInstance = sm.getCurrentRaidInstance();
			const info: EncounterStartInfo = {
				bossName,
				startTime: encounterStartTime,
				raidInstance: encounterRaidInstance,
			};
			for (const cb of encounterStartCbs) cb(info);
		}
	}

	function checkForEncounterEnd(): void {
		const completed = sm.popCompletedEncounter();
		if (completed === null) return;

		const { encounter, participants } = completed;
		if (encounter.duration < MIN_ENCOUNTER_DURATION_S) {
			encounterBossName = null;
			return;
		}

		const players: EncounterPlayer[] = [];
		const detectedPlayers = sm.getDetectedPlayers();
		for (const guid of participants) {
			const record = detectedPlayers.get(guid);
			if (record) {
				players.push({
					guid: record.guid,
					name: record.name,
					class: record.class,
					spec: record.spec,
				});
			}
		}

		const parsed: ParsedEncounter = { ...encounter, players };
		encounterBossName = null;
		for (const cb of encounterEndCbs) cb(parsed);
	}

	return {
		feedLine(line: string): void {
			if (isDestroyed) return;
			const event = parseLine(line, year);
			if (event === null) return;

			lastEventTimestamp = event.timestamp;
			wallClockAtLastEvent = Date.now();
			sm.processEvent(event);

			checkForNewPlayers();
			checkForEncounterStart();
			checkForEncounterEnd();
		},

		tick(currentTimeMs: number): void {
			if (isDestroyed) return;
			if (encounterBossName === null) return;

			// Bridge wall-clock time to log-domain timestamp.
			// lastEventTimestamp is in log-domain (parsed from combat log lines).
			// wallClockAtLastEvent is Date.now() captured when feedLine was called.
			// We compute the log-domain equivalent of "now" by adding the elapsed
			// wall-clock time since the last event to the last log-domain timestamp.
			const logTimeNow =
				lastEventTimestamp + (currentTimeMs - wallClockAtLastEvent);

			sm.checkIdleTimeout(logTimeNow);
			checkForEncounterEnd();
		},

		onEncounterStart(cb) {
			encounterStartCbs.push(cb);
		},

		onEncounterEnd(cb) {
			encounterEndCbs.push(cb);
		},

		onPlayerDetected(cb) {
			playerDetectedCbs.push(cb);
		},

		getActiveEncounter(): ActiveEncounterInfo | null {
			if (encounterBossName === null) return null;

			const combatStats = sm.getActiveCombatStats();
			const durationMs = lastEventTimestamp - encounterStartTime;
			const durationS = durationMs / 1000;
			const playerStats = new Map<
				string,
				{
					name: string;
					damage: number;
					damageTotal: number;
					dps: number;
					dpsTotal: number;
				}
			>();

			if (combatStats) {
				const detectedPlayers = sm.getDetectedPlayers();
				for (const [guid, stats] of combatStats) {
					const record = detectedPlayers.get(guid);
					const name = record?.name ?? guid;
					const dpsUseful =
						durationS > 0 ? Math.round(stats.damage / durationS) : 0;
					const dpsTotal =
						durationS > 0 ? Math.round(stats.damageTotal / durationS) : 0;
					playerStats.set(guid, {
						name,
						damage: stats.damage,
						damageTotal: stats.damageTotal,
						dps: dpsUseful,
						dpsTotal,
					});
				}
			}

			return {
				bossName: encounterBossName,
				startTime: encounterStartTime,
				currentDuration: Math.round(durationMs) / 1000,
				playerStats,
				playerCount: playerStats.size,
			};
		},

		getDetectedPlayers(): Map<string, PlayerInfo> {
			const result = new Map<string, PlayerInfo>();
			for (const [guid, record] of sm.getDetectedPlayers()) {
				result.set(guid, {
					guid: record.guid,
					name: record.name,
					class: record.class,
					spec: record.spec,
				});
			}
			return result;
		},

		destroy(): void {
			isDestroyed = true;
			encounterStartCbs.length = 0;
			encounterEndCbs.length = 0;
			playerDetectedCbs.length = 0;
		},
	};
}
