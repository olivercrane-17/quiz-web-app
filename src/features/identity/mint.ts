/**
 * Values the device mints for a restore or a claim (§2.4, §1.4 item 12):
 * 32 random bytes in base64url, from `crypto.getRandomValues`. A secret
 * and a claim token only ever travel from the device to the server, which
 * keeps their hashes. Call these from event handlers or effects (§10.2
 * rule 4).
 */
import {
  parseClaimToken,
  parseSecret,
  type ClaimToken,
  type Secret,
} from "@/engine/types";
import {
  base64url,
  systemRandom,
  type RandomBytes,
} from "@/platform/identity/local";

function bytes32(random: RandomBytes): string {
  const bytes = new Uint8Array(32);
  random(bytes);
  return base64url(bytes);
}

/** The new device secret a restore sends with the code or token. */
export function mintSecret(random: RandomBytes = systemRandom): Secret {
  const secret = parseSecret(bytes32(random));
  if (secret === null) throw new Error("could not mint a secret");
  return secret;
}

/** A claim link's token (§9.5). */
export function mintClaimToken(random: RandomBytes = systemRandom): ClaimToken {
  const token = parseClaimToken(bytes32(random));
  if (token === null) throw new Error("could not mint a claim token");
  return token;
}
