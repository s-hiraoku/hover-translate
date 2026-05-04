import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TranslateErrorCode } from "../shared/messages";
import { DeepLError, getUsage, translateText } from "./deepl-client";

function mockFetchResponse(args: {
  status?: number;
  json?: unknown;
  throwOnJson?: unknown;
}): Response {
  const status = args.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => {
      if (args.throwOnJson !== undefined) throw args.throwOnJson;
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

describe("DeepLError extra coverage", () => {
  it("preserves constructor arguments and Error inheritance", () => {
    const withStatus = new DeepLError("INVALID_KEY", "msg", 403);
    const withoutStatus = new DeepLError("INVALID_KEY", "msg");

    expect(withStatus).toBeInstanceOf(Error);
    expect(withStatus).toBeInstanceOf(DeepLError);
    expect(withStatus.code).toBe("INVALID_KEY");
    expect(withStatus.message).toBe("msg");
    expect(withStatus.status).toBe(403);
    expect(withoutStatus.status).toBeUndefined();
  });
});

describe("translateText extra coverage", () => {
  it.each(["hello", "hello & world", "日本語"])(
    "always sends stable form parameters and round-trips text %#",
    async (text) => {
      fetchMock().mockResolvedValue(
        mockFetchResponse({
          json: { translations: [{ detected_source_language: "EN", text: "translated" }] },
        }),
      );

      await expect(
        translateText({
          key: "key123",
          text,
          sourceLang: "EN",
          targetLang: "JA",
        }),
      ).resolves.toBe("translated");

      const [, init] = fetchMock().mock.calls[0] as [string, RequestInit];
      const body = new URLSearchParams(String(init.body));
      expect(body.get("text")).toBe(text);
      expect(body.get("preserve_formatting")).toBe("1");
      expect(body.get("split_sentences")).toBe("nonewlines");
    },
  );

  it("maps non-Error JSON parse failures to UNKNOWN", async () => {
    fetchMock().mockResolvedValue(mockFetchResponse({ throwOnJson: "not json" }));

    await expect(
      translateText({
        key: "key123",
        text: "hello",
        sourceLang: "EN",
        targetLang: "JA",
      }),
    ).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "Invalid JSON from DeepL",
      status: 200,
    });
  });

  it.each([
    [400, "UNKNOWN"],
    [404, "UNKNOWN"],
    [413, "UNKNOWN"],
    [422, "UNKNOWN"],
    [599, "SERVER_ERROR"],
    [600, "UNKNOWN"],
  ] satisfies [number, TranslateErrorCode][])(
    "maps lesser-tested HTTP %i to %s",
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
});

describe("getUsage extra coverage", () => {
  it("returns the DeepLUsage shape on success", async () => {
    fetchMock().mockResolvedValue(
      mockFetchResponse({ json: { character_count: 123, character_limit: 456000 } }),
    );

    const usage = await getUsage("key123");

    expect(usage).toEqual({ character_count: 123, character_limit: 456000 });
    expect(typeof usage.character_count).toBe("number");
    expect(typeof usage.character_limit).toBe("number");
  });
});
