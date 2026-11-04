/**
 * The identity contract against the mock backend (ARCHITECTURE §7.5): runs
 * in every `npm test`, skipping the methods the mock identity area does not
 * implement yet.
 */
import { runContract } from "./harness";
import { identityContract } from "./identity.contract";

runContract(identityContract, "mock");
