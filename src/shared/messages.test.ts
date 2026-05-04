import { describe, expect, it, vi } from "vitest";
import {
  buildErrorResponse,
  clampMaxChars,
  DEFAULT_MAX_CHARS,
  defaultState,
  MAX_MAX_CHARS,
  messageForCode,
  MIN_MAX_CHARS,
  normalizeState,
  readStorageState,
  resolveErrorMessage,
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

  it.each(["EN-US", "EN-GB"] as const)("passes through valid targetEnglish %s", (targetEnglish) => {
    expect(normalizeState({ targetEnglish }).targetEnglish).toBe(targetEnglish);
  });

  it.each(["EN", "JA", 42, null])("falls back for invalid targetEnglish %s", (targetEnglish) => {
    expect(normalizeState({ targetEnglish }).targetEnglish).toBe(defaultState.targetEnglish);
  });

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

  it.each([
    ["  abc:def  ", "abc:def"],
    ["", undefined],
    ["   ", undefined],
    [123, undefined],
    [{ key: "abc" }, undefined],
    ["valid-key", "valid-key"],
  ])("normalizes deeplApiKey=%s to %s", (deeplApiKey, expected) => {
    expect(normalizeState({ deeplApiKey }).deeplApiKey).toBe(expected);
  });

  it("round-trips a complete realistic stored object", () => {
    const stored: StorageState = {
      enabled: true,
      mode: "selection",
      selectionTrigger: "auto",
      targetEnglish: "EN-GB",
      maxChars: 2300,
      deeplApiKey: "abc123",
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

describe("messageForCode, resolveErrorMessage, and buildErrorResponse", () => {
  const errorCodes: TranslateErrorCode[] = [
    "MISSING_KEY",
    "INVALID_KEY",
    "QUOTA_EXCEEDED",
    "RATE_LIMITED",
    "SERVER_ERROR",
    "NETWORK_ERROR",
    "TEXT_TOO_LONG",
    "UNKNOWN",
  ];

  it.each(errorCodes)("returns a non-empty message for %s", (code) => {
    expect(messageForCode(code)).toEqual(expect.any(String));
    expect(messageForCode(code).length).toBeGreaterThan(0);
  });

  it("includes provided maxChars for TEXT_TOO_LONG", () => {
    expect(messageForCode("TEXT_TOO_LONG", 2000)).toContain("2000");
  });

  it("falls back to DEFAULT_MAX_CHARS for TEXT_TOO_LONG without maxChars", () => {
    expect(messageForCode("TEXT_TOO_LONG")).toContain(String(DEFAULT_MAX_CHARS));
  });

  it("resolveErrorMessage prefers errorCode over error string", () => {
    expect(resolveErrorMessage({ ok: false, errorCode: "INVALID_KEY", error: "raw" })).toBe(
      messageForCode("INVALID_KEY"),
    );
  });

  it("resolveErrorMessage uses error string when no code is present", () => {
    expect(resolveErrorMessage({ ok: false, error: "raw" })).toBe("raw");
  });

  it("resolveErrorMessage uses a generic fallback when neither code nor error is present", () => {
    expect(resolveErrorMessage({ ok: false })).toBe("Translation failed.");
  });

  it("buildErrorResponse maps DeepLError-shaped objects", () => {
    expect(buildErrorResponse({ code: "RATE_LIMITED", message: "Too many requests" })).toEqual({
      ok: false,
      errorCode: "RATE_LIMITED",
      error: messageForCode("RATE_LIMITED"),
    });
  });

  it("buildErrorResponse maps generic Error instances", () => {
    expect(buildErrorResponse(new Error("boom"))).toEqual({
      ok: false,
      errorCode: "UNKNOWN",
      error: "boom",
    });
  });

  it("buildErrorResponse maps string errors", () => {
    expect(buildErrorResponse("plain failure")).toEqual({
      ok: false,
      errorCode: "UNKNOWN",
      error: "plain failure",
    });
  });
});
