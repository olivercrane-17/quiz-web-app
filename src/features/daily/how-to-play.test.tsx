/**
 * How to play (PRD §3.1.3): the five parts in order, as the Daily's sheet
 * and `/how-scoring-works` both show them (RITE round 1, R1-02 and R1-04),
 * with round 2's stopwatch sentence (D19, R2-01) and tiebreak order (D21,
 * R2-04).
 */
import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  SO_FAR_TODAY,
  STOP_SCREEN_PERCENTILE,
  buildHowToPlay,
} from "./how-to-play";
import { HOW_TO_PLAY, HowToPlayText } from "./index";

function parts(): { heading: string; text: string }[] {
  return within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((item) => ({
      heading: within(item).getByRole("heading").textContent ?? "",
      text: item.textContent ?? "",
    }));
}

describe("How to play", () => {
  it("AC-DLY-30 covers the clue ladder, the points, the clue-4 options, the Encore and the ranking, in that order", () => {
    render(<HowToPlayText />);
    const [ladder, points, clue4, encore, ranking, ...rest] = parts();
    expect(rest).toEqual([]);
    expect(ladder?.heading).toBe("The clue ladder");
    expect(ladder?.text).toMatch(/four clues, hardest first/);
    expect(ladder?.text).toMatch(/Next clue for an easier one/);
    expect(points?.heading).toBe("The points");
    expect(points?.text).toMatch(/clue 1 for 4 points.*3.*2.*1/);
    expect(points?.text).toMatch(
      /A wrong guess costs exactly what Next clue costs/,
    );
    expect(clue4?.heading).toBe("Clue 4");
    expect(clue4?.text).toMatch(/four options/);
    expect(clue4?.text).toMatch(/a wrong pick scores 0/);
    expect(encore?.heading).toBe("The Encore");
    expect(encore?.text).toMatch(/One number, no points/);
    expect(encore?.text).toMatch(/Within 5% is a bullseye/);
    expect(encore?.text).toMatch(
      /tie on points, the closer guess ranks higher/,
    );
    expect(ranking?.heading).toBe("The ranking");
    expect(ranking?.text).toMatch(
      /Points come first, then the Encore, then total time/,
    );
    expect(ranking?.text).toMatch(/Nothing counts down/);
  });

  it("R2-01 D19 the ranking part says the stopwatch runs while a clue is open, even while you're away, and stops on every reveal", () => {
    render(<HowToPlayText />);
    const ranking = parts().at(-1);
    expect(ranking?.text).toContain(
      "The stopwatch runs while a clue is open, even while you're away or reading this, and stops on every reveal.",
    );
  });

  it("R2-04 D21 the Encore part says time only counts after the Encore", () => {
    const encore = HOW_TO_PLAY.parts.find((part) => part.id === "encore");
    expect(encore?.body).toContain(
      "If you tie on points, the closer guess ranks higher. Time only counts after that.",
    );
  });

  it("R2-04 D21 says nothing of “so far today” while the stop screen shows no percentile, and says it once one does", () => {
    // Greybox: DLY-3 builds the percentile in M2.
    expect(STOP_SCREEN_PERCENTILE).toBe(false);
    render(<HowToPlayText />);
    expect(screen.getByRole("list").textContent).not.toMatch(/so far today/);
    const later = buildHowToPlay({ percentile: true });
    expect(later.parts.at(-1)?.body.at(-1)).toBe(SO_FAR_TODAY);
    expect(SO_FAR_TODAY).toMatch(/“so far today”/);
    // The rest is the same text either way.
    expect(later.parts.slice(0, -1)).toEqual(HOW_TO_PLAY.parts.slice(0, -1));
  });

  it("R1-04 tells a newcomer what a wrong guess costs before they make one", () => {
    expect(HOW_TO_PLAY.parts.map((part) => part.id)).toEqual([
      "ladder",
      "points",
      "clue4",
      "encore",
      "ranking",
    ]);
    expect(HOW_TO_PLAY.parts[1]?.body.join(" ")).toContain("so have a go");
  });

  it("R1-02 renders on a server page for /how-scoring-works, its parts one level under the page's h1", () => {
    // The barrel holds no client module, so a server route can render it.
    const html = renderToStaticMarkup(<HowToPlayText headingLevel={2} />);
    expect(html.match(/<h2/g)).toHaveLength(5);
    expect(html).not.toContain("<h3");
    expect(html).toContain("The clue ladder");
  });

  it("follows the house style: no em dashes, and no 'tap' for a player on a keyboard", () => {
    const words = HOW_TO_PLAY.parts
      .flatMap((part) => [part.heading, ...part.body])
      .join(" ");
    expect(words).not.toMatch(/—/);
    expect(words).not.toMatch(/\btap\b/i);
  });
});
