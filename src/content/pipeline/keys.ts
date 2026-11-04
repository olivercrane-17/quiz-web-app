/**
 * The content key's loading and creation moved to scripts/content/crypto.ts
 * (CNT-0, ARCHITECTURE §2.1 and §5.4). This re-export keeps the pipeline's
 * and the content CLIs' imports working until CNT-1 reconciles
 * src/content/pipeline/ with §5; new code imports crypto.ts directly.
 */
export {
  KEY_ENV,
  decodeMasterKey,
  defaultKeyPath,
  generateKeyFile,
  keySourceFromProcess,
  loadMasterKey,
} from "../../../scripts/content/crypto.ts";
export type { KeySource, LoadedKey } from "../../../scripts/content/crypto.ts";
