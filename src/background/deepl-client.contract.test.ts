import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeepLError } from "./deepl-client";
import { getUsage, translateText } from "./deepl-client";

function mockFetchResponse(args: {
  status?: number;
  json?: unknown;
}): Response {
  const status = args.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => args.json),
  } as unknown as Response;
}

function fetchMock(): ReturnType<typeof vi.fn> {
  return vi.mocked(globalThis.fetch);
}

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DeepL request contract", () => {
  it.each([
    { text: "hello", sourceLang: "EN" as const, targetLang: "JA" as const },
    { text: "こんにちは", sourceLang: "JA" as const, targetLang: "EN-US" as const },
    { text: "colour", sourceLang: "EN" as const, targetLang: "EN-GB" as const },
  ])("sends every required form parameter for %#", async (args) => {
    fetchMock().mockResolvedValue(
      mockFetchResponse({
        json: { translations: [{ detected_source_language: args.sourceLang, text: "translated" }] },
      }),
    );

    await translateText({
      key: "key123",
      text: args.text,
      sourceLang: args.sourceLang,
      targetLang: args.targetLang,
    });

    const [, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(String(init.body));
    expect(body.get("text")).toBe(args.text);
    expect(body.get("source_lang")).toBe(args.sourceLang);
    expect(body.get("target_lang")).toBe(args.targetLang);
    expect(body.get("preserve_formatting")).toBe("1");
    expect(body.get("split_sentences")).toBe("nonewlines");
  });
});

describe("DeepL usage response contract", () => {
  it("returns numeric usage values unchanged", async () => {
    fetchMock().mockResolvedValue(
      mockFetchResponse({ json: { character_count: 100, character_limit: 500000 } }),
    );

    const usage = await getUsage("key123");

    expect(usage).toEqual({ character_count: 100, character_limit: 500000 });
    expect(typeof usage.character_count).toBe("number");
    expect(typeof usage.character_limit).toBe("number");
  });

  it("documents that string character_count is returned as-is without runtime validation", async () => {
    fetchMock().mockResolvedValue(
      mockFetchResponse({ json: { character_count: "100", character_limit: 500000 } }),
    );

    const usage = await getUsage("key123");

    expect(usage.character_count).toBe("100");
    expect(typeof usage.character_count).toBe("string");
  });

  it("documents that missing character_count remains absent", async () => {
    fetchMock().mockResolvedValue(
      mockFetchResponse({ json: { character_limit: 500000 } }),
    );

    const usage = await getUsage("key123");

    expect(Object.prototype.hasOwnProperty.call(usage, "character_count")).toBe(false);
    expect(usage.character_limit).toBe(500000);
  });
});

describe("DeepL translate response shape contract", () => {
  it("returns an empty translated string as a valid response", async () => {
    fetchMock().mockResolvedValue(mockFetchResponse({ json: { translations: [{ text: "" }] } }));

    await expect(
      translateText({
        key: "key123",
        text: "hello",
        sourceLang: "EN",
        targetLang: "JA",
      }),
    ).resolves.toBe("");
  });

  it("maps null translated text to UNKNOWN", async () => {
    fetchMock().mockResolvedValue(mockFetchResponse({ json: { translations: [{ text: null }] } }));

    await expect(
      translateText({
        key: "key123",
        text: "hello",
        sourceLang: "EN",
        targetLang: "JA",
      }),
    ).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "Unexpected DeepL translate response shape",
    } satisfies Partial<DeepLError>);
  });

  it("maps null translations to UNKNOWN", async () => {
    fetchMock().mockResolvedValue(mockFetchResponse({ json: { translations: null } }));

    await expect(
      translateText({
        key: "key123",
        text: "hello",
        sourceLang: "EN",
        targetLang: "JA",
      }),
    ).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "Unexpected DeepL translate response shape",
    } satisfies Partial<DeepLError>);
  });

  it("maps a missing translations key to UNKNOWN", async () => {
    fetchMock().mockResolvedValue(mockFetchResponse({ json: {} }));

    await expect(
      translateText({
        key: "key123",
        text: "hello",
        sourceLang: "EN",
        targetLang: "JA",
      }),
    ).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "Unexpected DeepL translate response shape",
    } satisfies Partial<DeepLError>);
  });
});
