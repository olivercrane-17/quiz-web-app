/**
 * The How to play text (PRD §3.1.3) as an ordered list of its five parts.
 * No client code, so the Daily's sheet renders it and a server page such as
 * `/how-scoring-works` can too, with its part headings one level under the
 * page's own heading.
 */
import { HOW_TO_PLAY } from "./how-to-play";

export interface HowToPlayTextProps {
  /** 3 under the sheet's `h2` title (the default), 2 under a page's `h1`. */
  headingLevel?: 2 | 3;
}

export function HowToPlayText({ headingLevel = 3 }: HowToPlayTextProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <ol className="flex flex-col gap-4" data-how-to-play="">
      {HOW_TO_PLAY.parts.map((part) => (
        <li key={part.id} data-part={part.id} className="flex flex-col gap-1">
          <Heading className="text-base font-bold">{part.heading}</Heading>
          {part.body.map((line) => (
            <p key={line} className="text-base leading-normal">
              {line}
            </p>
          ))}
        </li>
      ))}
    </ol>
  );
}
