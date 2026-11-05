/**
 * The identity contract against the real project (ARCHITECTURE §7.5,
 * §11.7). Runs only in the backend-contract workflow (QZ_REAL_BACKEND=1),
 * with test identities on the e2e track; it skips itself in the sandbox,
 * which cannot reach Supabase.
 */
import { runContract } from "./harness";
import { identityContract } from "./identity.contract";

runContract(identityContract, "real");
