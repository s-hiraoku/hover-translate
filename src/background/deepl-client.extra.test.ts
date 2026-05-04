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
  it("leaves status undefined when omitted", () => {
    const withoutStatus = new DeepLError("INVALID_KEY", "msg");

    expect(withoutStatus.status).toBeUndefined();
  });
});

describe("translateText extra coverage", () => {
  it("round-trips Japanese text through form encoding", async () => {
    const text = "日本語";
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
    expect(new URLSearchParams(String(init.body)).get("text")).toBe(text);
  });

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
    [400, "UNKNOWN", "4xx fallback"],
    [599, "SERVER_ERROR", "server-error upper boundary"],
    [600, "UNKNOWN", "server-error exclusive boundary"],
  ] satisfies [number, TranslateErrorCode, string][])(
    "maps lesser-tested HTTP %i to %s (%s)",
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
