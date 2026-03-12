// src/utils/guid.ts

export function isPlayer(guid: string): boolean {
  return guid.startsWith("0x0E");
}

export function isNpc(guid: string): boolean {
  return guid.startsWith("0xF130");
}

export function isPet(guid: string): boolean {
  return guid.startsWith("0xF140");
}

export function isVehicle(guid: string): boolean {
  return guid.startsWith("0xF150");
}

/** Extract 6-char NPC ID from GUID middle bytes. */
export function getNpcId(guid: string): string {
  return guid.substring(6, 12).toUpperCase();
}

export function isNullGuid(guid: string): boolean {
  return guid === "0x0000000000000000";
}
