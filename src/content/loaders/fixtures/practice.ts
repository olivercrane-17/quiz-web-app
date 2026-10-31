/**
 * The fixture practice items (content/fixtures/practice/, ARCHITECTURE §5.6),
 * decoded into built ChoiceItems. One import per file, because the content
 * pipeline keeps one item per file; the fixture test checks that this list
 * matches the files on disk.
 */
import type { PracticeItem } from "@/engine/types";

import { decodePracticeItem, isInPlay } from "./decode";

import pFood0101 from "../../../../content/fixtures/practice/food-drink/fx.p.food.0101.json";
import pFood0102 from "../../../../content/fixtures/practice/food-drink/fx.p.food.0102.json";
import pFood0103 from "../../../../content/fixtures/practice/food-drink/fx.p.food.0103.json";
import pFood0104 from "../../../../content/fixtures/practice/food-drink/fx.p.food.0104.json";
import pFood0105 from "../../../../content/fixtures/practice/food-drink/fx.p.food.0105.json";
import pFood0106 from "../../../../content/fixtures/practice/food-drink/fx.p.food.0106.json";
import pFood0107 from "../../../../content/fixtures/practice/food-drink/fx.p.food.0107.json";
import pFood0108 from "../../../../content/fixtures/practice/food-drink/fx.p.food.0108.json";
import pFood0109 from "../../../../content/fixtures/practice/food-drink/fx.p.food.0109.json";
import pFood0110 from "../../../../content/fixtures/practice/food-drink/fx.p.food.0110.json";
import pGeo0101 from "../../../../content/fixtures/practice/geography/fx.p.geo.0101.json";
import pGeo0102 from "../../../../content/fixtures/practice/geography/fx.p.geo.0102.json";
import pGeo0103 from "../../../../content/fixtures/practice/geography/fx.p.geo.0103.json";
import pGeo0104 from "../../../../content/fixtures/practice/geography/fx.p.geo.0104.json";
import pGeo0105 from "../../../../content/fixtures/practice/geography/fx.p.geo.0105.json";
import pGeo0106 from "../../../../content/fixtures/practice/geography/fx.p.geo.0106.json";
import pGeo0107 from "../../../../content/fixtures/practice/geography/fx.p.geo.0107.json";
import pGeo0108 from "../../../../content/fixtures/practice/geography/fx.p.geo.0108.json";
import pGeo0109 from "../../../../content/fixtures/practice/geography/fx.p.geo.0109.json";
import pGeo0110 from "../../../../content/fixtures/practice/geography/fx.p.geo.0110.json";
import pHist0101 from "../../../../content/fixtures/practice/history/fx.p.hist.0101.json";
import pHist0102 from "../../../../content/fixtures/practice/history/fx.p.hist.0102.json";
import pHist0103 from "../../../../content/fixtures/practice/history/fx.p.hist.0103.json";
import pHist0104 from "../../../../content/fixtures/practice/history/fx.p.hist.0104.json";
import pHist0105 from "../../../../content/fixtures/practice/history/fx.p.hist.0105.json";
import pHist0106 from "../../../../content/fixtures/practice/history/fx.p.hist.0106.json";
import pHist0107 from "../../../../content/fixtures/practice/history/fx.p.hist.0107.json";
import pHist0108 from "../../../../content/fixtures/practice/history/fx.p.hist.0108.json";
import pHist0109 from "../../../../content/fixtures/practice/history/fx.p.hist.0109.json";
import pHist0110 from "../../../../content/fixtures/practice/history/fx.p.hist.0110.json";
import pSci0101 from "../../../../content/fixtures/practice/science-tech/fx.p.sci.0101.json";
import pSci0102 from "../../../../content/fixtures/practice/science-tech/fx.p.sci.0102.json";
import pSci0103 from "../../../../content/fixtures/practice/science-tech/fx.p.sci.0103.json";
import pSci0104 from "../../../../content/fixtures/practice/science-tech/fx.p.sci.0104.json";
import pSci0105 from "../../../../content/fixtures/practice/science-tech/fx.p.sci.0105.json";
import pSci0106 from "../../../../content/fixtures/practice/science-tech/fx.p.sci.0106.json";
import pSci0107 from "../../../../content/fixtures/practice/science-tech/fx.p.sci.0107.json";
import pSci0108 from "../../../../content/fixtures/practice/science-tech/fx.p.sci.0108.json";
import pSci0109 from "../../../../content/fixtures/practice/science-tech/fx.p.sci.0109.json";
import pSci0110 from "../../../../content/fixtures/practice/science-tech/fx.p.sci.0110.json";

const SOURCES: readonly (readonly [string, unknown])[] = [
  ["practice/food-drink/fx.p.food.0101.json", pFood0101],
  ["practice/food-drink/fx.p.food.0102.json", pFood0102],
  ["practice/food-drink/fx.p.food.0103.json", pFood0103],
  ["practice/food-drink/fx.p.food.0104.json", pFood0104],
  ["practice/food-drink/fx.p.food.0105.json", pFood0105],
  ["practice/food-drink/fx.p.food.0106.json", pFood0106],
  ["practice/food-drink/fx.p.food.0107.json", pFood0107],
  ["practice/food-drink/fx.p.food.0108.json", pFood0108],
  ["practice/food-drink/fx.p.food.0109.json", pFood0109],
  ["practice/food-drink/fx.p.food.0110.json", pFood0110],
  ["practice/geography/fx.p.geo.0101.json", pGeo0101],
  ["practice/geography/fx.p.geo.0102.json", pGeo0102],
  ["practice/geography/fx.p.geo.0103.json", pGeo0103],
  ["practice/geography/fx.p.geo.0104.json", pGeo0104],
  ["practice/geography/fx.p.geo.0105.json", pGeo0105],
  ["practice/geography/fx.p.geo.0106.json", pGeo0106],
  ["practice/geography/fx.p.geo.0107.json", pGeo0107],
  ["practice/geography/fx.p.geo.0108.json", pGeo0108],
  ["practice/geography/fx.p.geo.0109.json", pGeo0109],
  ["practice/geography/fx.p.geo.0110.json", pGeo0110],
  ["practice/history/fx.p.hist.0101.json", pHist0101],
  ["practice/history/fx.p.hist.0102.json", pHist0102],
  ["practice/history/fx.p.hist.0103.json", pHist0103],
  ["practice/history/fx.p.hist.0104.json", pHist0104],
  ["practice/history/fx.p.hist.0105.json", pHist0105],
  ["practice/history/fx.p.hist.0106.json", pHist0106],
  ["practice/history/fx.p.hist.0107.json", pHist0107],
  ["practice/history/fx.p.hist.0108.json", pHist0108],
  ["practice/history/fx.p.hist.0109.json", pHist0109],
  ["practice/history/fx.p.hist.0110.json", pHist0110],
  ["practice/science-tech/fx.p.sci.0101.json", pSci0101],
  ["practice/science-tech/fx.p.sci.0102.json", pSci0102],
  ["practice/science-tech/fx.p.sci.0103.json", pSci0103],
  ["practice/science-tech/fx.p.sci.0104.json", pSci0104],
  ["practice/science-tech/fx.p.sci.0105.json", pSci0105],
  ["practice/science-tech/fx.p.sci.0106.json", pSci0106],
  ["practice/science-tech/fx.p.sci.0107.json", pSci0107],
  ["practice/science-tech/fx.p.sci.0108.json", pSci0108],
  ["practice/science-tech/fx.p.sci.0109.json", pSci0109],
  ["practice/science-tech/fx.p.sci.0110.json", pSci0110],
];

/** The files this module bundles, relative to content/fixtures/. */
export const FIXTURE_PRACTICE_FILES: readonly string[] = SOURCES.map(
  ([file]) => file,
);

/** Every fixture practice item in play, in file order. */
export const FIXTURE_PRACTICE_ITEMS: readonly PracticeItem[] = Object.freeze(
  SOURCES.filter(([, raw]) => isInPlay(raw)).map(([file, raw]) =>
    decodePracticeItem(raw, file),
  ),
);
