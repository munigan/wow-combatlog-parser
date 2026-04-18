import { describe, expect, it, vi } from "vitest";
import { createRealtimeParser } from "../../src/realtime-parser.js";
import type {
	ActiveEncounterInfo,
	EncounterStartInfo,
	ParsedEncounter,
	PlayerInfo,
} from "../../src/types.js";

// Patchwerk: NPC ID 003E9C, Naxxramas
const PATCHWERK_GUID = "0xF130003E9C000001";
// Grobbulus: NPC ID 003E3B, Naxxramas
const GROBBULUS_GUID = "0xF130003E3B000001";
const PLAYER1_GUID = "0x0E00000000000001";
const PLAYER2_GUID = "0x0E00000000000002";

function makeSpellDamageLine(
	date: string,
	time: string,
	sourceGuid: string,
	sourceName: string,
	destGuid: string,
	destName: string,
	spellId: number,
	spellName: string,
	damage: number,
): string {
	return `${date} ${time}  SPELL_DAMAGE,${sourceGuid},"${sourceName}",0x512,${destGuid},"${destName}",0xa48,${spellId},"${spellName}",0x1,${damage},0,0x1,0,0,0,nil,nil,nil`;
}

function makeUnitDiedLine(
	date: string,
	time: string,
	destGuid: string,
	destName: string,
): string {
	return `${date} ${time}  UNIT_DIED,0x0000000000000000,nil,0x80000000,${destGuid},"${destName}",0x10a48`;
}

describe("createRealtimeParser", () => {
	it("fires onEncounterStart when damage hits a boss", () => {
		const parser = createRealtimeParser({ year: 2024 });
		const startCb = vi.fn<(info: EncounterStartInfo) => void>();
		parser.onEncounterStart(startCb);

		parser.feedLine(
			makeSpellDamageLine(
				"3/5",
				"20:00:00.000",
				PLAYER1_GUID,
				"Warrior",
				PATCHWERK_GUID,
				"Patchwerk",
				47486,
				"Mortal Strike",
				5000,
			),
		);

		expect(startCb).toHaveBeenCalledOnce();
		expect(startCb.mock.calls[0][0].bossName).toBe("Patchwerk");
	});

	it("fires onEncounterEnd on UNIT_DIED with stats", () => {
		const parser = createRealtimeParser({ year: 2024 });
		const endCb = vi.fn<(encounter: ParsedEncounter) => void>();
		parser.onEncounterEnd(endCb);

		// Start encounter
		parser.feedLine(
			makeSpellDamageLine(
				"3/5",
				"20:00:00.000",
				PLAYER1_GUID,
				"Warrior",
				PATCHWERK_GUID,
				"Patchwerk",
				47486,
				"Mortal Strike",
				5000,
			),
		);

		// More damage over 60 seconds to exceed 10s minimum
		for (let i = 1; i <= 59; i++) {
			const seconds = String(i).padStart(2, "0");
			parser.feedLine(
				makeSpellDamageLine(
					"3/5",
					`20:00:${seconds}.000`,
					PLAYER1_GUID,
					"Warrior",
					PATCHWERK_GUID,
					"Patchwerk",
					47486,
					"Mortal Strike",
					5000,
				),
			);
		}

		// Kill
		parser.feedLine(
			makeUnitDiedLine("3/5", "20:01:00.000", PATCHWERK_GUID, "Patchwerk"),
		);

		expect(endCb).toHaveBeenCalledOnce();
		const encounter = endCb.mock.calls[0][0];
		expect(encounter.bossName).toBe("Patchwerk");
		expect(encounter.result).toBe("kill");
		expect(encounter.duration).toBeCloseTo(60, 0);
		expect(encounter.players.length).toBeGreaterThan(0);
	});

	it("returns live stats via getActiveEncounter()", () => {
		const parser = createRealtimeParser({ year: 2024 });

		expect(parser.getActiveEncounter()).toBeNull();

		parser.feedLine(
			makeSpellDamageLine(
				"3/5",
				"20:00:00.000",
				PLAYER1_GUID,
				"Warrior",
				PATCHWERK_GUID,
				"Patchwerk",
				47486,
				"Mortal Strike",
				5000,
			),
		);

		parser.feedLine(
			makeSpellDamageLine(
				"3/5",
				"20:00:10.000",
				PLAYER1_GUID,
				"Warrior",
				PATCHWERK_GUID,
				"Patchwerk",
				47486,
				"Mortal Strike",
				5000,
			),
		);

		const active = parser.getActiveEncounter();
		expect(active).not.toBeNull();
		expect(active!.bossName).toBe("Patchwerk");
		expect(active!.currentDuration).toBeCloseTo(10, 0);
		expect(active!.playerCount).toBeGreaterThan(0);
		const live = active!.playerStats.get(PLAYER1_GUID);
		expect(live).toBeDefined();
		// First damage line can occur before encounter combat window opens; the second line is reliably in-encounter.
		expect(live!.damage).toBe(5000);
		expect(live!.damageTotal).toBe(5000);
		expect(live!.dps).toBe(500);
		expect(live!.dpsTotal).toBe(500);
	});

	it("fires onPlayerDetected for new players", () => {
		const parser = createRealtimeParser({ year: 2024 });
		const playerCb = vi.fn<(player: PlayerInfo) => void>();
		parser.onPlayerDetected(playerCb);

		parser.feedLine(
			makeSpellDamageLine(
				"3/5",
				"20:00:00.000",
				PLAYER1_GUID,
				"Warrior",
				PATCHWERK_GUID,
				"Patchwerk",
				47486,
				"Mortal Strike",
				5000,
			),
		);

		expect(playerCb).toHaveBeenCalled();
		expect(playerCb.mock.calls[0][0].name).toBe("Warrior");
	});

	it("detects wipe via tick() idle timeout", () => {
		const parser = createRealtimeParser({ year: 2024 });
		const endCb = vi.fn<(encounter: ParsedEncounter) => void>();
		parser.onEncounterEnd(endCb);

		// Feed damage lines spanning > 10 seconds to exceed minimum duration filter
		for (let i = 0; i <= 15; i++) {
			const seconds = String(i).padStart(2, "0");
			parser.feedLine(
				makeSpellDamageLine(
					"3/5",
					`20:00:${seconds}.000`,
					PLAYER1_GUID,
					"Warrior",
					PATCHWERK_GUID,
					"Patchwerk",
					47486,
					"Mortal Strike",
					5000,
				),
			);
		}

		expect(endCb).not.toHaveBeenCalled();

		// Simulate 31 seconds of inactivity via tick.
		// tick() bridges wall-clock to log-domain: logTimeNow = lastEventTimestamp + (currentTimeMs - wallClockAtLastEvent).
		// Since feedLine just ran, wallClockAtLastEvent ≈ Date.now().
		// Passing Date.now() + 31_000 makes logTimeNow ≈ lastEventTimestamp + 31_000,
		// which exceeds Patchwerk's 30s idle threshold.
		parser.tick(Date.now() + 31_000);

		expect(endCb).toHaveBeenCalledOnce();
		expect(endCb.mock.calls[0][0].result).toBe("wipe");
	});

	it("tick() is a no-op with no active encounter", () => {
		const parser = createRealtimeParser({ year: 2024 });
		const endCb = vi.fn<(encounter: ParsedEncounter) => void>();
		parser.onEncounterEnd(endCb);

		parser.tick(Date.now());
		expect(endCb).not.toHaveBeenCalled();
	});

	it("handles multi-encounter sequences", () => {
		const parser = createRealtimeParser({ year: 2024 });
		const startCb = vi.fn<(info: EncounterStartInfo) => void>();
		const endCb = vi.fn<(encounter: ParsedEncounter) => void>();
		parser.onEncounterStart(startCb);
		parser.onEncounterEnd(endCb);

		// Encounter 1: Patchwerk kill (20 seconds)
		for (let i = 0; i <= 20; i++) {
			const seconds = String(i).padStart(2, "0");
			parser.feedLine(
				makeSpellDamageLine(
					"3/5",
					`20:00:${seconds}.000`,
					PLAYER1_GUID,
					"Warrior",
					PATCHWERK_GUID,
					"Patchwerk",
					47486,
					"Mortal Strike",
					5000,
				),
			);
		}
		parser.feedLine(
			makeUnitDiedLine("3/5", "20:00:20.000", PATCHWERK_GUID, "Patchwerk"),
		);

		// Encounter 2: Grobbulus kill (15 seconds, after 2 min gap)
		for (let i = 0; i <= 15; i++) {
			const seconds = String(i).padStart(2, "0");
			parser.feedLine(
				makeSpellDamageLine(
					"3/5",
					`20:02:${seconds}.000`,
					PLAYER1_GUID,
					"Warrior",
					GROBBULUS_GUID,
					"Grobbulus",
					47486,
					"Mortal Strike",
					5000,
				),
			);
		}
		parser.feedLine(
			makeUnitDiedLine("3/5", "20:02:15.000", GROBBULUS_GUID, "Grobbulus"),
		);

		expect(startCb).toHaveBeenCalledTimes(2);
		expect(endCb).toHaveBeenCalledTimes(2);
		expect(endCb.mock.calls[0][0].bossName).toBe("Patchwerk");
		expect(endCb.mock.calls[1][0].bossName).toBe("Grobbulus");
	});

	it("filters encounters shorter than 10 seconds", () => {
		const parser = createRealtimeParser({ year: 2024 });
		const endCb = vi.fn<(encounter: ParsedEncounter) => void>();
		parser.onEncounterEnd(endCb);

		// 5 second encounter — should be filtered
		for (let i = 0; i <= 5; i++) {
			parser.feedLine(
				makeSpellDamageLine(
					"3/5",
					`20:00:0${i}.000`,
					PLAYER1_GUID,
					"Warrior",
					PATCHWERK_GUID,
					"Patchwerk",
					47486,
					"Mortal Strike",
					5000,
				),
			);
		}
		parser.feedLine(
			makeUnitDiedLine("3/5", "20:00:05.000", PATCHWERK_GUID, "Patchwerk"),
		);

		expect(endCb).not.toHaveBeenCalled();
	});

	it("destroy() prevents further processing", () => {
		const parser = createRealtimeParser({ year: 2024 });
		const startCb = vi.fn<(info: EncounterStartInfo) => void>();
		parser.onEncounterStart(startCb);

		parser.destroy();

		parser.feedLine(
			makeSpellDamageLine(
				"3/5",
				"20:00:00.000",
				PLAYER1_GUID,
				"Warrior",
				PATCHWERK_GUID,
				"Patchwerk",
				47486,
				"Mortal Strike",
				5000,
			),
		);

		expect(startCb).not.toHaveBeenCalled();
	});

	it("ignores malformed lines", () => {
		const parser = createRealtimeParser({ year: 2024 });
		const startCb = vi.fn<(info: EncounterStartInfo) => void>();
		parser.onEncounterStart(startCb);

		parser.feedLine("this is not a valid combat log line");
		parser.feedLine("");
		parser.feedLine("   ");

		expect(startCb).not.toHaveBeenCalled();
	});
});
