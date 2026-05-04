import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installChromeMock } from "../test/chrome-mock";
import type { StorageState, TranslateRequest } from "../shared/messages";
import { STORAGE_KEY, defaultState } from "../shared/messages";
import { DeepLError } from "./deepl-client";

const { getUsage, translateText } = vi.hoisted(() => ({
  getUsage: vi.fn<typeof import("./deepl-client").getUsage>(),
  translateText: vi.fn<typeof import("./deepl-client").translateText>(),
}));

vi.mock("./deepl-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./deepl-client")>();
  return {
    ...actual,
    getUsage,
    translateText,
  };
});

function seedStorage(state: Partial<StorageState>): void {
  void chrome.storage.local.set({ [STORAGE_KEY]: { ...defaultState, ...state } });
}

async function importTranslator(): Promise<typeof import("./translator")> {
  vi.resetModules();
  return import("./translator");
}

function request(patch: Partial<TranslateRequest> = {}): TranslateRequest {
  return {
    type: "TRANSLATE",
    text: "hi",
    source: "en",
    target: "ja",
    ...patch,
  };
}

beforeEach(() => {
  installChromeMock();
  translateText.mockReset();
  getUsage.mockReset();
  translateText.mockResolvedValue("translated");
  getUsage.mockResolvedValue({ character_count: 100, character_limit: 500000 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("translate cache extra coverage", () => {
  it.each([
    {
      name: "different context",
      firstState: {},
      secondState: {},
      firstRequest: { text: "same", source: "en", target: "ja", context: "formal" },
      secondRequest: { text: "same", source: "en", target: "ja", context: "casual" },
      firstCall: { context: "formal" },
      secondCall: { context: "casual" },
    },
    {
      name: "EN-US vs EN-GB targetEnglish",
      firstState: { targetEnglish: "EN-US" },
      secondState: { targetEnglish: "EN-GB" },
      firstRequest: { text: "same", source: "ja", target: "en" },
      secondRequest: { text: "same", source: "ja", target: "en" },
      firstCall: { targetLang: "EN-US" },
      secondCall: { targetLang: "EN-GB" },
    },
  ] satisfies {
    name: string;
    firstState: Partial<StorageState>;
    secondState: Partial<StorageState>;
    firstRequest: Partial<TranslateRequest>;
    secondRequest: Partial<TranslateRequest>;
    firstCall: Record<string, unknown>;
    secondCall: Record<string, unknown>;
  }[])(
    "keeps same text cache entries separate for $name",
    async ({ firstState, secondState, firstRequest, secondRequest, firstCall, secondCall }) => {
      seedStorage({ deeplApiKey: "key123", ...firstState });
      const { translate } = await importTranslator();

      await translate(request(firstRequest));
      seedStorage({ deeplApiKey: "key123", ...secondState });
      await translate(request(secondRequest));

      expect(translateText).toHaveBeenCalledTimes(2);
      expect(translateText).toHaveBeenNthCalledWith(1, expect.objectContaining(firstCall));
      expect(translateText).toHaveBeenNthCalledWith(2, expect.objectContaining(secondCall));
    },
  );

  it("propagates DeepLError instances from translateText unchanged", async () => {
    seedStorage({ deeplApiKey: "key123" });
    const deeplError = new DeepLError("RATE_LIMITED", "slow down", 429);
    translateText.mockRejectedValue(deeplError);
    const { translate } = await importTranslator();

    await expect(translate(request())).rejects.toBe(deeplError);
    await expect(translate(request())).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("fetchUsage extra coverage", () => {
  it("rejects a whitespace-only override key without calling getUsage", async () => {
    const { fetchUsage } = await importTranslator();

    await expect(fetchUsage({ key: "   " })).rejects.toMatchObject({ code: "MISSING_KEY" });

    expect(getUsage).not.toHaveBeenCalled();
  });

  it("uses an override key without reading storage", async () => {
    seedStorage({ deeplApiKey: "saved-key" });
    const getSpy = vi.spyOn(chrome.storage.local, "get");
    const { fetchUsage } = await importTranslator();

    await expect(fetchUsage({ key: " override-key " })).resolves.toEqual({
      character_count: 100,
      character_limit: 500000,
    });

    expect(getSpy).not.toHaveBeenCalled();
    expect(getUsage).toHaveBeenCalledWith("override-key");
  });

  it("rejects an empty saved key after normalization", async () => {
    seedStorage({ deeplApiKey: "  " });
    const { fetchUsage } = await importTranslator();

    await expect(fetchUsage()).rejects.toMatchObject({ code: "MISSING_KEY" });

    expect(getUsage).not.toHaveBeenCalled();
  });
});
