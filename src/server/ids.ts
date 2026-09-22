import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@contracts/game.schemas";

/**
 * All three identifiers come from node:crypto. Room codes are shareable; round
 * ids are public within the room; resume tokens are private credentials that
 * are returned only to their owner (module 05).
 */

/** Six characters from an alphabet with no 0/O/1/I, so a code can be read aloud. */
export function generateRoomCode(): string {
  let code = "";
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function generateRoundId(): string {
  return randomUUID();
}

/** 32 random bytes, base64url encoded: 43 characters, within resumeTokenSchema. */
export function generateResumeToken(): string {
  return randomBytes(32).toString("base64url");
}
