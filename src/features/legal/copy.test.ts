import { describe, expect, it } from "vitest";

import { parseLocalDate, type LocalDate } from "@/engine/types";

import {
  CONTACT_EMAIL,
  CONTACT_LINK,
  LIST_NAMES,
  formatUpdated,
  joinNames,
  licenceMark,
  licenceName,
  listNames,
} from "./copy";
import { DATASET_CREDITS, LIST_CREDITS } from "./generated/licenses";
import { linkKind, renderMarks } from "./ui/rich-text";

const date = (iso: string) => parseLocalDate(iso) as LocalDate;

describe("the legal feature's shared words", () => {
  it("writes the Last updated date with the month spelled out and no weekday (DESIGN §12.40)", () => {
    expect(formatUpdated(date("2026-10-31"))).toBe("31 October 2026");
    expect(formatUpdated(date("2026-11-05"))).toBe("5 November 2026");
  });

  it("names licences as people know them, linking those with a canonical page", () => {
    expect(licenceName("CC-BY-4.0")).toBe("CC BY 4.0");
    expect(licenceName("ODC-PDDL-1.0 AND CC-BY-4.0")).toBe(
      "Open Data Commons Public Domain Dedication 1.0 and CC BY 4.0",
    );
    expect(licenceName("Something new")).toBe("Something new");
    expect(licenceMark("CC0-1.0")).toBe(
      "[CC0 (public domain dedication)](https://creativecommons.org/publicdomain/zero/1.0/)",
    );
    expect(licenceMark("MIT")).toBe("MIT License");
  });

  it("has a name for every licence /credits shows", () => {
    for (const dataset of DATASET_CREDITS) {
      for (const part of dataset.license.split(/\s+AND\s+/)) {
        expect(licenceName(part), part).not.toBe("");
      }
    }
  });

  it("has a display name for every answer list that ships", () => {
    for (const list of LIST_CREDITS) {
      expect(LIST_NAMES[list.type], list.type).toBeDefined();
    }
  });

  it("joins names in plain English", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Countries"])).toBe("Countries");
    expect(joinNames(["Countries", "Cities"])).toBe("Countries and Cities");
    expect(listNames(["country", "city", "person"])).toBe(
      "Countries, Cities and People",
    );
  });

  it("sends every question to one contact address", () => {
    expect(CONTACT_EMAIL).toMatch(/^[a-z]+@[a-z0-9.-]+\.[a-z]+$/);
    expect(CONTACT_LINK).toBe(`[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`);
  });
});

describe("the text marks", () => {
  it("draws links, strong text and code, and leaves everything else as words", () => {
    const parts = renderMarks(
      "Read **this**, then [our terms](/terms) and `qz:settings`.",
    );
    expect(parts).toHaveLength(7);
    expect(parts[0]).toBe("Read ");
    expect(parts[6]).toBe(".");
  });

  it("draws a path on this site as a page link; an anchor, a section of another page, https or mail as a plain one; and refuses the rest", () => {
    expect(linkKind("/terms")).toBe("page");
    // A document load, so keyboard and screen-reader focus start at the
    // section rather than back at the top of the page.
    expect(linkKind("/how-scoring-works#how-scoring-works-corrections")).toBe(
      "plain",
    );
    expect(linkKind("#privacy-children")).toBe("plain");
    expect(linkKind("https://lucide.dev")).toBe("plain");
    expect(linkKind("mailto:hello@knewt.app")).toBe("plain");
    expect(linkKind("//evil.example")).toBeNull();
    expect(linkKind("http://example.com")).toBeNull();
    expect(linkKind("javascript:alert(1)")).toBeNull();
  });
});
