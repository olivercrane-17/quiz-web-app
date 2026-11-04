/**
 * The envelope format moved to scripts/content/crypto.ts (CNT-0, ARCHITECTURE
 * §2.1 and §5.4), which documents it. This re-export keeps the pipeline's
 * imports working until CNT-1 reconciles src/content/pipeline/ with §5; new
 * code imports crypto.ts directly.
 */
export {
  ENVELOPE_ALG,
  ENVELOPE_VERSION,
  HKDF_INFO_ENC,
  HKDF_INFO_IV,
  HKDF_INFO_ORDER,
  HKDF_SALT,
  KEY_ID,
  deriveIv,
  deriveSealKeys,
  envelopeProblems,
  envelopeText,
  isEnvelope,
  keyFingerprint,
  openEnvelope,
  sealBytes,
} from "../../../scripts/content/crypto.ts";
export type { Envelope, SealKeys } from "../../../scripts/content/crypto.ts";
