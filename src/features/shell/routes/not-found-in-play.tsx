/**
 * The not-found page for a `notFound()` in the `(play)` group, such as a
 * room or a shared quiz with its Beta flag off (DESIGN §12.42; RITE round
 * 1, R1-02). The `(play)` layout holds only the skip link and the live
 * regions, since every play screen draws its own header and `<main>`, so
 * this brings the tab pages' frame without those two: the top bar, the
 * page and the tab bar, with no tab marked. `src/app/(play)/not-found.tsx`
 * re-exports it.
 */
import { NotFoundContent } from "../not-found";
import { TabsFrame } from "./tabs-layout";

export default function NotFoundInPlayRoute() {
  return (
    <TabsFrame markTab={false} outer={false}>
      <NotFoundContent />
    </TabsFrame>
  );
}
