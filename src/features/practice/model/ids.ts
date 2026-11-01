/**
 * Version 4 UUIDs for local runs and their idempotency keys (ARCHITECTURE
 * §4.2: a practice run's id is a UUID from crypto.getRandomValues, and it
 * seeds the run). getRandomValues works outside secure contexts, where
 * randomUUID does not.
 */
export type RandomBytes = (bytes: Uint8Array) => Uint8Array;

const cryptoBytes: RandomBytes = (bytes) => crypto.getRandomValues(bytes);

export function uuidV4(random: RandomBytes = cryptoBytes): string {
  const bytes = random(new Uint8Array(16));
  // Version 4 and the RFC 9562 variant.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  const part = (from: number, to: number) => hex.slice(from, to).join("");
  return `${part(0, 4)}-${part(4, 6)}-${part(6, 8)}-${part(8, 10)}-${part(10, 16)}`;
}
