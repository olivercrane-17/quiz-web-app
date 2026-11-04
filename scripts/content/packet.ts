/**
 * npm run content:packet: the content team's name for the packet builder,
 * which lives at scripts/content/packets.ts as ARCHITECTURE §2.1 and §5.8
 * name it (`content:packets`). This entry runs the same module under the
 * old name, so every command and message stays as it was.
 */
import { runPackets } from "./packets.ts";

runPackets("content:packet");
