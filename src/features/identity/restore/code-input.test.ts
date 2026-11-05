/**
 * The restore field's grouping as you type (DESIGN §12.26) and its reading
 * of typed forms (§9.2, AC-SYN-02).
 */
import { describe, expect, it } from "vitest";

import { parseSyncCode } from "@/engine/types";

import {
  caretAfter,
  codeCharactersBefore,
  formatTypedCode,
} from "./code-input";

describe("formatTypedCode", () => {
  it("AC-SYN-02 reads lower case, no hyphens, spaces, I and L for 1 and O for 0 as the same code", () => {
    const code = "K7QX-2M9P-T4RW-8H10";
    for (const typed of [
      "K7QX2M9PT4RW8H10",
      "k7qx2m9pt4rw8h10",
      "k7qx 2m9p t4rw 8h10",
      "K7QX-2M9P-T4RW-8HIO",
      "k7qx\u20132m9p\u2014t4rw 8hlo",
      "  K7QX-2M9P-T4RW-8H10  ",
    ]) {
      expect(formatTypedCode(typed), typed).toBe(code);
      expect(parseSyncCode(formatTypedCode(typed))).toBe("K7QX2M9PT4RW8H10");
    }
  });

  it("groups as it goes and stops at 16 characters", () => {
    expect(formatTypedCode("")).toBe("");
    expect(formatTypedCode("k")).toBe("K");
    expect(formatTypedCode("k7qx")).toBe("K7QX");
    expect(formatTypedCode("k7qx2")).toBe("K7QX-2");
    expect(formatTypedCode("K7QX-2M9P-T4RW-8H10-EXTRA")).toBe(
      "K7QX-2M9P-T4RW-8H10",
    );
  });

  it("drops pasted punctuation but keeps a mistyped letter, so the mistake shows", () => {
    expect(formatTypedCode("k7qx.2m9p")).toBe("K7QX-2M9P");
    expect(formatTypedCode("k7qu")).toBe("K7QU");
    expect(parseSyncCode("K7QU2M9PT4RW8H10")).toBeNull();
  });
});

describe("the caret", () => {
  it("stays after the character it followed", () => {
    expect(caretAfter(0)).toBe(0);
    expect(caretAfter(1)).toBe(1);
    expect(caretAfter(4)).toBe(4);
    expect(caretAfter(5)).toBe(6);
    expect(caretAfter(8)).toBe(9);
    expect(caretAfter(16)).toBe(19);
    // Typing a fifth character at the end: "K7QX2" with the caret at 5.
    expect(caretAfter(codeCharactersBefore("K7QX2", 5))).toBe(6);
    // Editing in the middle: after "K7" in "K7QX-2M9P".
    expect(caretAfter(codeCharactersBefore("K7aQX-2M9P", 3))).toBe(3);
    expect(codeCharactersBefore("k7 qx", 5)).toBe(4);
  });
});
