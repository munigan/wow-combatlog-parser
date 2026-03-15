// src/utils/guid.ts

export function isPlayer(guid: string): boolean {
  // Player GUIDs have type 0 in the high nibble, with varying server flags
  // in the remaining bits. Known prefixes: 0x0E, 0x06.
  // Exclude 0x00 (null GUID) and 0x0F (would collide with creature type 0xF1).
  return guid.startsWith("0x0") && guid.charAt(3) !== "0" && !guid.startsWith("0x0F");
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
