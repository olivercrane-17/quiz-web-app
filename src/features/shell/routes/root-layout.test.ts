import { describe, expect, it } from "vitest";

import { ROOT_METADATA } from "./root-layout";

describe("the metadata every page starts from", () => {
  it("R1-20 names Knewt in every title, the description and the link preview", () => {
    expect(ROOT_METADATA.title).toEqual({
      default: "Knewt",
      template: "%s · Knewt",
    });
    expect(ROOT_METADATA.applicationName).toBe("Knewt");
    expect(ROOT_METADATA.description).toMatch(/^Knewt is a daily trivia game/);
    expect(ROOT_METADATA.openGraph).toMatchObject({
      type: "website",
      siteName: "Knewt",
      title: "Knewt",
      description: ROOT_METADATA.description,
    });
    expect(ROOT_METADATA.twitter).toMatchObject({
      card: "summary",
      title: "Knewt",
      description: ROOT_METADATA.description,
    });
  });

  it("R1-20 never says the scaffold's name", () => {
    expect(JSON.stringify(ROOT_METADATA)).not.toMatch(/quiz web app/i);
  });
});

describe("Today's title", () => {
  it("R3-08 is 'Today · Knewt' through the root template, and its link preview still says Knewt", async () => {
    const { TODAY_METADATA } = await import("./today-metadata");
    const template = (ROOT_METADATA.title as { template: string }).template;
    expect(template.replace("%s", String(TODAY_METADATA.title))).toBe(
      "Today · Knewt",
    );
    expect(TODAY_METADATA.openGraph).toBeUndefined();
    expect(TODAY_METADATA.twitter).toBeUndefined();
  });
});
