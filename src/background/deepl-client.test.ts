import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TranslateErrorCode } from "../shared/messages";
import { DeepLError, getUsage, translateText } from "./deepl-client";

function mockFetchResponse(args: {
  status?: number;
  json?: unknown;
  throwOnJson?: Error;
}): Response {
  const status = args.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => {
      if (args.throwOnJson) throw args.throwOnJson;
      return args.json;
    }),
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

describe("DeepLError", () => {
  it("has the expected instance shape", () => {
    const error = new DeepLError("INVALID_KEY", "bad key", 403);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("DeepLError");
    expect(error.code).toBe("INVALID_KEY");
    expect(error.status).toBe(403);
  });
});

describe("translateText", () => {
  it("returns the first translated text and posts the expected form body", async () => {
    fetchMock().mockResolvedValue(
      mockFetchResponse({
        json: { translations: [{ detected_source_language: "EN", text: "こんにちは" }] },
      }),
    );

    await expect(
      translateText({
        key: "key123",
        text: "hello",
        sourceLang: "EN",
        targetLang: "JA",
      }),
    ).resolves.toBe("こんにちは");

    expect(fetchMock()).toHaveBeenCalledWith(
      "https://api-free.deepl.com/v2/translate",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "DeepL-Auth-Key key123",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }),
    );

    const [, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(String(init.body));
    expect(body.get("text")).toBe("hello");
    expect(body.get("source_lang")).toBe("EN");
    expect(body.get("target_lang")).toBe("JA");
    expect(body.get("preserve_formatting")).toBe("1");
    expect(body.get("split_sentences")).toBe("nonewlines");
  });

  it("includes context when supplied", async () => {
    fetchMock().mockResolvedValue(
      mockFetchResponse({
        json: { translations: [{ detected_source_language: "EN", text: "こんにちは" }] },
      }),
    );

    await translateText({
      key: "key123",
      text: "hello",
      context: "greeting",
      sourceLang: "EN",
      targetLang: "JA",
    });

    const [, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(new URLSearchParams(String(init.body)).get("context")).toBe("greeting");
  });

  it("omits context when not supplied", async () => {
    fetchMock().mockResolvedValue(
      mockFetchResponse({
        json: { translations: [{ detected_source_language: "EN", text: "こんにちは" }] },
      }),
    );

    await translateText({
      key: "key123",
      text: "hello",
      sourceLang: "EN",
      targetLang: "JA",
    });

    const [, init] = fetchMock().mock.calls[0] as [string, RequestInit];
    expect(new URLSearchParams(String(init.body)).has("context")).toBe(false);
  });

  it.each([
    [403, "INVALID_KEY"],
    [456, "QUOTA_EXCEEDED"],
    [429, "RATE_LIMITED"],
    [500, "SERVER_ERROR"],
    [503, "SERVER_ERROR"],
    [400, "UNKNOWN"],
    [418, "UNKNOWN"],
  ] satisfies [number, TranslateErrorCode][])(
    "maps HTTP %i to %s",
    async (status, code) => {
      fetchMock().mockResolvedValue(mockFetchResponse({ status, json: {} }));

      await expect(
        translateText({
          key: "key123",
          text: "hello",
          sourceLang: "EN",
          targetLang: "JA",
        }),
      ).rejects.toMatchObject({ code, status });
    },
  );

  it("maps fetch rejection to NETWORK_ERROR", async () => {
    fetchMock().mockRejectedValue(new Error("socket closed"));

    await expect(
      translateText({
        key: "key123",
        text: "hello",
        sourceLang: "EN",
        targetLang: "JA",
      }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR", message: "socket closed" });
  });

  it("maps invalid JSON to UNKNOWN", async () => {
    fetchMock().mockResolvedValue(
      mockFetchResponse({ throwOnJson: new Error("Unexpected token") }),
    );

    await expect(
      translateText({
        key: "key123",
        text: "hello",
        sourceLang: "EN",
        targetLang: "JA",
      }),
    ).rejects.toMatchObject({ code: "UNKNOWN", message: "Unexpected token" });
  });

  it.each([
    [{ translations: [] }],
    [{ translations: [{ detected_source_language: "EN", text: undefined }] }],
  ])("rejects unexpected response shape %#", async (json) => {
    fetchMock().mockResolvedValue(mockFetchResponse({ json }));

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
    });
  });
});

describe("getUsage", () => {
  it("returns usage and sends the expected request", async () => {
    fetchMock().mockResolvedValue(
      mockFetchResponse({ json: { character_count: 100, character_limit: 500000 } }),
    );

    await expect(getUsage("key123")).resolves.toEqual({
      character_count: 100,
      character_limit: 500000,
    });

    expect(fetchMock()).toHaveBeenCalledWith("https://api-free.deepl.com/v2/usage", {
      method: "GET",
      headers: {
        Authorization: "DeepL-Auth-Key key123",
      },
    });
  });

  it.each([
    [403, "INVALID_KEY"],
    [456, "QUOTA_EXCEEDED"],
    [429, "RATE_LIMITED"],
    [503, "SERVER_ERROR"],
    [400, "UNKNOWN"],
  ] satisfies [number, TranslateErrorCode][])(
    "maps HTTP %i to %s",
    async (status, code) => {
      fetchMock().mockResolvedValue(mockFetchResponse({ status, json: {} }));

      await expect(getUsage("key123")).rejects.toMatchObject({ code, status });
    },
  );

  it("maps fetch rejection to NETWORK_ERROR", async () => {
    fetchMock().mockRejectedValue(new Error("offline"));

    await expect(getUsage("key123")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      message: "offline",
    });
  });
});
