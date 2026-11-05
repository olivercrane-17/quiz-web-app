/**
 * `/credits` (PRD §3.14, DESIGN §12.40): both fonts with their Open Font
 * License texts, Lucide's ISC licence, the sounds, every open dataset in
 * content/datasets/manifest.json with its licence and the answer lists
 * that name it in their `provenance`, Wikidata where a dataset supplied
 * its ids, and the notices of the open-source packages the app runs on.
 * Everything that lives in another file comes from the generated module
 * (`scripts/content/licenses.ts`), so the page can't fall behind a new
 * dataset, list source or dependency.
 */
import type { FeatureFlag } from "@/config/features";
import { SHELL_COPY } from "@/features/shell";

import {
  LIST_NAMES,
  joinNames,
  licenceMark,
  licenceName,
  listNames,
} from "../copy";
import {
  legalDate,
  type Block,
  type LegalDocument,
  type TermItem,
} from "../document";
import {
  DATASET_CREDITS,
  FONT_LICENCES,
  ICON_LICENCE,
  LIST_CREDITS,
  SOFTWARE_NOTICES,
  type DatasetCredit,
  type ListCredit,
  type SoftwareNotice,
} from "../generated/licenses";

/** Who made each font, and where it lives (DESIGN §3.1), by licence file. */
export const FONT_CREDITS: Readonly<
  Record<string, { family: string; maker: string; url: string; use: string }>
> = {
  "OFL-Fraunces.txt": {
    family: "Fraunces",
    maker: "Undercase Type",
    url: "https://github.com/undercasetype/Fraunces",
    use: "headings and numbers",
  },
  "OFL-AtkinsonHyperlegibleNext.txt": {
    family: "Atkinson Hyperlegible Next",
    maker: "the Braille Institute of America",
    url: "https://github.com/googlefonts/atkinson-hyperlegible-next",
    use: "everything you read",
  },
};

function fontItems(): TermItem[] {
  return FONT_LICENCES.map((font) => {
    const credit = FONT_CREDITS[font.file];
    if (credit === undefined) {
      throw new Error(`/credits has no maker for ${font.file}`);
    }
    return {
      term: `[${credit.family}](${credit.url})`,
      details: [
        `By ${credit.maker}, for ${credit.use}. ${licenceName("OFL-1.1")}.`,
      ],
      licence: {
        summary: `Read the ${credit.family} licence`,
        text: font.text,
      },
    };
  });
}

function datasetUse(dataset: DatasetCredit): string {
  const parts: string[] = [];
  if (dataset.listsFrom.length > 0) {
    parts.push(
      `Data in our ${listNames(dataset.listsFrom)} ${dataset.listsFrom.length === 1 ? "list" : "lists"}.`,
    );
  }
  if (dataset.listsChecked.length > 0) {
    parts.push(
      `Used to check our ${listNames(dataset.listsChecked)} ${dataset.listsChecked.length === 1 ? "list" : "lists"}.`,
    );
  }
  if (parts.length === 0) parts.push("Used to check facts in our questions.");
  return parts.join(" ");
}

function datasetItem(dataset: DatasetCredit): TermItem {
  const details = [
    `${licenceMark(dataset.license)}. Credit: ${dataset.sourceLabel}, version ${dataset.version}.`,
    datasetUse(dataset),
  ];
  if (dataset.licenseNote !== null) {
    details.push(`Licence note: ${dataset.licenseNote}.`);
  }
  return {
    term: `[${dataset.title}](${dataset.url})`,
    details,
    ...(dataset.licenceText === null
      ? {}
      : {
          licence: {
            summary: `${licenceName(dataset.license)} text for ${dataset.title}`,
            text: dataset.licenceText,
          },
        }),
  };
}

function packageLine(notice: SoftwareNotice, index: number): string {
  const pkg = notice.packages[index];
  if (pkg === undefined) return "";
  const copyright =
    pkg.copyright.length > 0
      ? `: ${pkg.copyright.join("; ")}`
      : pkg.licenceFile
        ? ""
        : " (it ships no licence file of its own)";
  return `\`${pkg.name}\` ${pkg.version}${copyright}`;
}

function softwareBlocks(): Block[] {
  return SOFTWARE_NOTICES.flatMap((notice): Block[] => {
    const name = notice.licenses.map(licenceName).join(" or ");
    const lines = notice.packages.map((_, index) => packageLine(notice, index));
    return [
      { kind: "subhead", text: name },
      { kind: "list", items: lines },
      ...(notice.text === ""
        ? []
        : [
            {
              kind: "licence" as const,
              summary: `Read the ${name} text${notice.packages.length > 1 ? `, shared by these ${String(notice.packages.length)} packages` : ""}`,
              text: notice.text,
            },
          ]),
    ];
  });
}

/** Source names in a list's line, each once: "Unicode CLDR and GeoNames". */
function sourceNames(keys: readonly string[]): string {
  const labels = keys.map(
    (key) =>
      DATASET_CREDITS.find((dataset) => dataset.key === key)?.sourceLabel ??
      key,
  );
  return joinNames([...new Set(labels)]);
}

/** One answer list and where its entries come from, as its provenance says. */
function listItem(list: ListCredit): TermItem {
  const parts: string[] = [];
  if (list.compiled) {
    parts.push("Compiled by our content team");
    if (list.from.length > 0)
      parts.push(`with data from ${sourceNames(list.from)}`);
    if (list.checkedAgainst.length > 0) {
      parts.push(`checked against ${sourceNames(list.checkedAgainst)}`);
    }
  } else {
    parts.push(`From ${sourceNames(list.from)}`);
  }
  return {
    term: LIST_NAMES[list.type] ?? list.type,
    details: [`${parts.join(", ")}.`],
  };
}

export function creditsDocument(
  _flags: (flag: FeatureFlag) => boolean,
): LegalDocument {
  const lists = [...LIST_CREDITS].sort((a, b) =>
    (LIST_NAMES[a.type] ?? a.type).localeCompare(
      LIST_NAMES[b.type] ?? b.type,
      "en",
    ),
  );
  const compiledLicenses = [
    ...new Set(
      LIST_CREDITS.map((list) => list.compiledLicense ?? "").filter(
        (license) => license !== "",
      ),
    ),
  ];
  const withWikidata = LIST_CREDITS.filter((list) => list.wikidata);
  const listDatasets = DATASET_CREDITS.filter(
    (dataset) =>
      dataset.listsFrom.length > 0 || dataset.listsChecked.length > 0,
  );
  const checkingDatasets = DATASET_CREDITS.filter(
    (dataset) =>
      dataset.listsFrom.length === 0 && dataset.listsChecked.length === 0,
  );

  return {
    path: "/credits",
    title: SHELL_COPY.legal.credits,
    updated: legalDate("2026-11-05"),
    lede: [
      "Knewt is built with fonts, icons, data and software that other people made and shared. Here they are, with their licences. Thank you.",
    ],
    sections: [
      {
        id: "fonts",
        heading: "Fonts",
        blocks: [{ kind: "terms", items: fontItems() }],
      },
      {
        id: "icons",
        heading: "Icons",
        blocks: [
          {
            kind: "p",
            text: "Our icons are drawn from [Lucide](https://lucide.dev), under the ISC License. Some Lucide icons come from [Feather](https://feathericons.com), under the MIT License. The newt and our own marks, such as the tally and the difficulty dots, are ours.",
          },
          {
            kind: "licence",
            summary: "Read Lucide's licence",
            text: ICON_LICENCE.text,
          },
        ],
      },
      {
        id: "sounds",
        heading: "Sounds",
        blocks: [
          {
            kind: "p",
            text: "Every sound in Knewt is made in your browser from our own recipes, so there are no recordings to credit.",
          },
        ],
      },
      {
        id: "answer-lists",
        heading: "Our answer lists",
        blocks: [
          {
            kind: "p",
            text: `A Mystery's answer comes from a closed list for its kind of answer. Here is where each list comes from${compiledLicenses.length > 0 ? `. Our content team's entries are shared under the ${compiledLicenses.map(licenceName).join(" and ")}` : ""}.`,
          },
          { kind: "terms", items: lists.map(listItem) },
          { kind: "subhead", text: "The open data in them" },
          { kind: "terms", items: listDatasets.map(datasetItem) },
          ...(withWikidata.length > 0
            ? [
                {
                  kind: "p" as const,
                  text: `Some entries in our ${listNames(withWikidata.map((list) => list.type))} lists carry their [Wikidata](https://www.wikidata.org) identifiers, which came with the datasets above. Wikidata's data is available under ${licenceMark("CC0-1.0")}.`,
                },
              ]
            : []),
        ],
      },
      {
        id: "fact-checking",
        heading: "Data we check facts against",
        blocks: [
          {
            kind: "p",
            text: "Our fact-checkers also compare questions with these open datasets. Nothing from them ships in the app.",
          },
          { kind: "terms", items: checkingDatasets.map(datasetItem) },
        ],
      },
      {
        id: "software",
        heading: "Open-source software",
        blocks: [
          {
            kind: "p",
            text: "Knewt runs on open-source software. These are the packages it is built from, with their licences:",
          },
          ...softwareBlocks(),
        ],
      },
    ],
  };
}
