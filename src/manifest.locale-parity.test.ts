import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

type LocaleMessages = Record<string, { message?: unknown; placeholders?: unknown }>;

const MESSAGE_KEY_PATTERN = /^__MSG_(.+)__$/;

const readLocale = async (locale: "en" | "ja") =>
  JSON.parse(
    await readFile(
      resolve(process.cwd(), `public/_locales/${locale}/messages.json`),
      "utf8",
    ),
  ) as LocaleMessages;

const collectManifestKeys = (value: unknown, keys = new Set<string>()) => {
  if (typeof value === "string") {
    const match = MESSAGE_KEY_PATTERN.exec(value);
    if (match) keys.add(match[1]);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectManifestKeys(item, keys));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectManifestKeys(item, keys));
  }
  return keys;
};

const expectContainsKeys = (
  actualName: string,
  actualKeys: Set<string>,
  expectedName: string,
  expectedKeys: Set<string>,
) => {
  const actual = [...actualKeys];
  for (const key of expectedKeys) {
    expect(
      actualKeys.has(key),
      `expected ${actualName} to contain key "${key}" from ${expectedName}, got ${JSON.stringify(actual)}`,
    ).toBe(true);
  }
};

describe("manifest locale key parity", () => {
  const loadKeySets = async () => {
    const [en, ja] = await Promise.all([readLocale("en"), readLocale("ja")]);
    return {
      manifest: collectManifestKeys(manifest),
      en: new Set(Object.keys(en)),
      ja: new Set(Object.keys(ja)),
    };
  };

  it.each([
    ["manifest", "en"],
    ["manifest", "ja"],
    ["en", "ja"],
  ] as const)("%s and %s declare the same locale keys", async (left, right) => {
    const keySets = await loadKeySets();
    expectContainsKeys(left, keySets[left], right, keySets[right]);
    expectContainsKeys(right, keySets[right], left, keySets[left]);
  });

  it("keeps the locale key set non-empty", async () => {
    expect(
      (await loadKeySets()).manifest.size,
      "expected manifest to contain at least one __MSG_*__ key",
    ).toBeGreaterThan(0);
  });

  it.each(["en", "ja"] as const)("%s locale entries use Chrome i18n message shape", async (locale) => {
    for (const [key, entry] of Object.entries(await readLocale(locale))) {
      expect(typeof entry.message, `expected ${locale}.${key}.message to be a string`).toBe("string");
      expect((entry.message as string).trim(), `expected ${locale}.${key}.message to be non-empty`).not.toBe("");
      if ("placeholders" in entry) {
        expect(
          entry.placeholders && typeof entry.placeholders === "object" && !Array.isArray(entry.placeholders),
          `expected ${locale}.${key}.placeholders to be an object when present`,
        ).toBe(true);
      }
    }
  });
});
