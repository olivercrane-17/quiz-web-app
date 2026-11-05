// @vitest-environment node
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  EVENTS,
  checkEventProps,
  isAllowedValue,
  isEventName,
  type EventProps,
} from "./dictionary.ts";

describe("the analytics dictionary", () => {
  it("names the events of PRD §7.2, including the revision's additions", () => {
    for (const name of [
      "run_complete",
      "how_to_play_open",
      "stop_screen_view",
      "share_open",
      "age_band_set",
      "web_vitals",
      "client_error",
    ]) {
      expect(isEventName(name)).toBe(true);
    }
    expect(EVENTS.offer_action.offer.values).toContain("repair");
    expect(EVENTS.share_open.surface.values).toContain("home");
    expect(EVENTS.age_band_set.moment.values).toContain("room_name");
    expect(EVENTS.web_vitals.metric.values).toContain("NEXT");
    expect(EVENTS.client_error.kind.values).toContain("server");
    expect(isEventName("page_view")).toBe(false);
    expect(isEventName("toString")).toBe(false);
  });

  it("types each event's props from its specs", () => {
    expectTypeOf<EventProps<"run_complete">>().toEqualTypeOf<{
      readonly mode:
        | "daily"
        | "archive"
        | "practice"
        | "blitz"
        | "survival"
        | "review"
        | "challenge"
        | "room"
        | "quiz";
      readonly score_band:
        "0-3" | "4-6" | "7-9" | "10-12" | "7-8" | "9-10" | "na";
      readonly composition: string;
    }>();
    expectTypeOf<EventProps<"how_to_play_open">["round"]>().toEqualTypeOf<
      number | "none"
    >();
    expectTypeOf<EventProps<"storage_lost">>().toEqualTypeOf<
      Record<never, never>
    >();
  });

  it("allows exactly the dictionary's keys and values", () => {
    expect(
      checkEventProps("run_complete", {
        mode: "daily",
        score_band: "7-9",
        composition: "m3e1",
      }),
    ).toEqual({ ok: true });
    expect(checkEventProps("storage_lost", {})).toEqual({ ok: true });
    expect(checkEventProps("nope", {})).toEqual({
      ok: false,
      problem: "unknown_event",
      prop: null,
    });
    expect(
      checkEventProps("run_complete", { mode: "daily", score_band: "7-9" }),
    ).toEqual({ ok: false, problem: "missing", prop: "composition" });
    expect(
      checkEventProps("storage_lost", { email: "someone@example.com" }),
    ).toEqual({ ok: false, problem: "extra", prop: "email" });
    expect(
      checkEventProps("run_complete", {
        mode: "daily",
        score_band: "13",
        composition: "m3e1",
      }),
    ).toEqual({ ok: false, problem: "invalid", prop: "score_band" });
    expect(checkEventProps("storage_lost", null)).toEqual({
      ok: false,
      problem: "invalid",
      prop: null,
    });
  });

  it("checks each value kind", () => {
    expect(isAllowedValue(EVENTS.mystery_input.typed, true)).toBe(true);
    expect(isAllowedValue(EVENTS.mystery_input.typed, "yes")).toBe(false);
    expect(isAllowedValue(EVENTS.mystery_input.round, 3)).toBe(true);
    expect(isAllowedValue(EVENTS.mystery_input.round, 4)).toBe(false);
    expect(isAllowedValue(EVENTS.web_vitals.value, Number.NaN)).toBe(false);
    expect(isAllowedValue(EVENTS.how_to_play_open.round, "none")).toBe(true);
    expect(isAllowedValue(EVENTS.how_to_play_open.round, 11)).toBe(false);
    expect(isAllowedValue(EVENTS.question_heart.item_id, "p.geo.0142")).toBe(
      true,
    );
    expect(isAllowedValue(EVENTS.question_heart.item_id, "daily:42:2")).toBe(
      true,
    );
    expect(
      isAllowedValue(EVENTS.question_heart.item_id, "quiz:AB12CD34EF:3"),
    ).toBe(true);
    // Sealed ids never travel in analytics.
    expect(isAllowedValue(EVENTS.question_heart.item_id, "m.geo.0101")).toBe(
      false,
    );
    expect(isAllowedValue(EVENTS.client_error.rpc, "round_action")).toBe(true);
    expect(isAllowedValue(EVENTS.client_error.rpc, "Round Action")).toBe(false);
    expect(isAllowedValue(EVENTS.client_error.rpc, "x".repeat(49))).toBe(false);
    expect(
      isAllowedValue(EVENTS.client_error.message_hash, "0123456789abcdef"),
    ).toBe(true);
    expect(
      isAllowedValue(EVENTS.client_error.message_hash, "0123456789ABCDEF"),
    ).toBe(false);
  });
});
