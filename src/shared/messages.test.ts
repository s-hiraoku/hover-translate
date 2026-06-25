import { describe, expect, it, vi } from "vitest";
import {
  clampMaxChars,
  DEFAULT_MAX_CHARS,
  defaultState,
  MAX_MAX_CHARS,
  messageForCode,
  MIN_MAX_CHARS,
  normalizeState,
  readStorageState,
  STORAGE_KEY,
  updateStorageState,
} from "./messages";
import type { StorageState, TranslateErrorCode } from "./messages";

describe("normalizeState", () => {
  it.each([undefined, null, "enabled", 1, true])(
    "returns defaultState for non-record input: %s",
    (input) => {
      expect(normalizeState(input)).toEqual(defaultState);
    },
  );

  it("returns defaultState for an empty object", () => {
    expect(normalizeState({})).toEqual(defaultState);
  });

  it.each([
    [true, true],
    [false, false],
    [0, false],
    ["", false],
    ["true", false],
    [null, false],
    [undefined, false],
  ])("coerces enabled=%s to %s", (input, expected) => {
    expect(normalizeState({ enabled: input }).enabled).toBe(expected);
  });

  it.each(["hover", "selection"] as const)("passes through valid mode %s", (mode) => {
    expect(normalizeState({ mode }).mode).toBe(mode);
  });

  it.each(["bad", 42, null])("falls back for invalid mode %s", (mode) => {
    expect(normalizeState({ mode }).mode).toBe(defaultState.mode);
  });

  it.each(["shortcut", "auto"] as const)(
    "passes through valid selectionTrigger %s",
    (selectionTrigger) => {
      expect(normalizeState({ selectionTrigger }).selectionTrigger).toBe(selectionTrigger);
    },
  );

  it.each(["bad", 42, null])(
    "falls back for invalid selectionTrigger %s",
    (selectionTrigger) => {
      expect(normalizeState({ selectionTrigger }).selectionTrigger).toBe(
        defaultState.selectionTrigger,
      );
    },
  );

  it.each([
    [1500, 1500],
    [MIN_MAX_CHARS - 1, MIN_MAX_CHARS],
    [MAX_MAX_CHARS + 1, MAX_MAX_CHARS],
    [1500.7, 1501],
    [Number.NaN, DEFAULT_MAX_CHARS],
    [Infinity, DEFAULT_MAX_CHARS],
    ["abc", DEFAULT_MAX_CHARS],
    [undefined, DEFAULT_MAX_CHARS],
  ])("normalizes maxChars=%s to %s", (maxChars, expected) => {
    expect(normalizeState({ maxChars }).maxChars).toBe(expected);
  });

  it("round-trips a complete realistic stored object", () => {
    const stored: StorageState = {
      enabled: true,
      mode: "selection",
      selectionTrigger: "auto",
      maxChars: 2300,
    };

    expect(normalizeState(stored)).toEqual(stored);
  });
});

describe("clampMaxChars", () => {
  it.each([
    [1500, 1500],
    [MIN_MAX_CHARS - 1, MIN_MAX_CHARS],
    [MAX_MAX_CHARS + 1, MAX_MAX_CHARS],
    [1500.7, 1501],
    [Number.NaN, DEFAULT_MAX_CHARS],
    [Infinity, DEFAULT_MAX_CHARS],
  ])("clamps %s to %s", (input, expected) => {
    expect(clampMaxChars(input)).toBe(expected);
  });
});

describe("readStorageState and updateStorageState", () => {
  it("readStorageState returns defaultState when no value is stored", async () => {
    await expect(readStorageState()).resolves.toEqual(defaultState);
  });

  it("readStorageState returns normalized stored state", async () => {
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        enabled: true,
        mode: "bogus",
        maxChars: MAX_MAX_CHARS + 1,
      },
    });

    await expect(readStorageState()).resolves.toEqual({
      ...defaultState,
      enabled: true,
      mode: "hover",
      maxChars: MAX_MAX_CHARS,
    });
  });

  it("updateStorageState writes back the full normalized state and returns it", async () => {
    const setSpy = vi.spyOn(chrome.storage.local, "set");

    await expect(updateStorageState({ enabled: true })).resolves.toEqual({
      ...defaultState,
      enabled: true,
    });
    expect(setSpy).toHaveBeenCalledWith({
      [STORAGE_KEY]: {
        ...defaultState,
        enabled: true,
      },
    });
  });

  it("updateStorageState merges over existing partial and invalid state", async () => {
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        enabled: true,
        mode: "bogus",
        selectionTrigger: "auto",
      },
    });

    await expect(updateStorageState({ maxChars: 2100 })).resolves.toEqual({
      ...defaultState,
      enabled: true,
      mode: "hover",
      selectionTrigger: "auto",
      maxChars: 2100,
    });
  });
});

describe("messageForCode", () => {
  it.each([
    [
      "TRANSLATOR_UNSUPPORTED",
      "Chrome built-in translation is unavailable in this browser. Use desktop Chrome 138 or later.",
    ],
    ["LANGUAGE_PACK_UNAVAILABLE", "English-Japanese translation is unavailable on this device."],
    [
      "LANGUAGE_PACK_DOWNLOAD_REQUIRED",
      "Language pack download needs a click. Open the popup and press Prepare.",
    ],
    ["TEXT_TOO_LONG", `Text too long (max ${DEFAULT_MAX_CHARS} chars).`],
    ["UNKNOWN", "Translation failed."],
  ] satisfies [TranslateErrorCode, string][])("returns the exact message for %s", (code, message) => {
    expect(messageForCode(code)).toBe(message);
  });

  it("includes provided maxChars for TEXT_TOO_LONG", () => {
    expect(messageForCode("TEXT_TOO_LONG", 2000)).toContain("2000");
  });

  it("falls back to DEFAULT_MAX_CHARS for TEXT_TOO_LONG without maxChars", () => {
    expect(messageForCode("TEXT_TOO_LONG")).toContain(String(DEFAULT_MAX_CHARS));
  });
});
