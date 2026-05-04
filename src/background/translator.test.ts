import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

interface MockChromeStorageArea {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  data: Record<string, unknown>;
}

function createStorageArea(): MockChromeStorageArea {
  const area: MockChromeStorageArea = {
    data: {},
    get: vi.fn(async (key?: string) => {
      if (typeof key === "string") {
        return { [key]: area.data[key] };
      }
      return { ...area.data };
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(area.data, items);
    }),
    remove: vi.fn(async (key: string) => {
      delete area.data[key];
    }),
  };
  return area;
}

function installChromeMock(): MockChromeStorageArea {
  const local = createStorageArea();
  (globalThis as { chrome: typeof chrome }).chrome = {
    storage: {
      local: local as unknown as chrome.storage.StorageArea,
    },
  } as typeof chrome;
  return local;
}

function seedStorage(state: Partial<StorageState>): void {
  const area = chrome.storage.local as unknown as MockChromeStorageArea;
  area.data[STORAGE_KEY] = { ...defaultState, ...state };
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

describe("translate", () => {
  it("delegates to DeepL with saved settings", async () => {
    seedStorage({ deeplApiKey: "key123", maxChars: 1500 });
    const { translate } = await importTranslator();

    await expect(translate(request({ text: "hi" }))).resolves.toBe("translated");

    expect(translateText).toHaveBeenCalledWith({
      key: "key123",
      text: "hi",
      sourceLang: "EN",
      targetLang: "JA",
      context: undefined,
    });
  });

  it("throws MISSING_KEY when no API key is saved", async () => {
    seedStorage({ deeplApiKey: undefined });
    const { translate } = await importTranslator();

    await expect(translate(request())).rejects.toMatchObject({ code: "MISSING_KEY" });
  });

  it("throws TEXT_TOO_LONG without calling DeepL", async () => {
    // normalizeState clamps maxChars to MIN_MAX_CHARS (500), so the
    // smallest enforceable limit is the default. Send text longer than that.
    seedStorage({ deeplApiKey: "key123", maxChars: defaultState.maxChars });
    const { translate } = await importTranslator();

    await expect(
      translate(request({ text: "x".repeat(defaultState.maxChars + 1) })),
    ).rejects.toMatchObject({
      code: "TEXT_TOO_LONG",
    });
    expect(translateText).not.toHaveBeenCalled();
  });

  it.each([
    ["ja", "en", "EN-GB", "JA", "EN-GB"],
    ["en", "ja", "EN-US", "EN", "JA"],
    ["en", "en", "EN-US", "EN", "EN-US"],
  ] satisfies [
    TranslateRequest["source"],
    TranslateRequest["target"],
    StorageState["targetEnglish"],
    "EN" | "JA",
    "EN-US" | "EN-GB" | "JA",
  ][])(
    "maps %s to %s with targetEnglish %s",
    async (source, target, targetEnglish, sourceLang, targetLang) => {
      seedStorage({ deeplApiKey: "key123", targetEnglish });
      const { translate } = await importTranslator();

      await translate(request({ source, target }));

      expect(translateText).toHaveBeenCalledWith(
        expect.objectContaining({ sourceLang, targetLang }),
      );
    },
  );
});

describe("translate cache", () => {
  it("reuses cached results for identical requests", async () => {
    seedStorage({ deeplApiKey: "key123" });
    translateText.mockResolvedValue("one");
    const { translate } = await importTranslator();

    await expect(translate(request({ text: "same" }))).resolves.toBe("one");
    await expect(translate(request({ text: "same" }))).resolves.toBe("one");

    expect(translateText).toHaveBeenCalledTimes(1);
  });

  it("misses cache for different context", async () => {
    seedStorage({ deeplApiKey: "key123" });
    const { translate } = await importTranslator();

    await translate(request({ text: "same", context: "a" }));
    await translate(request({ text: "same", context: "b" }));

    expect(translateText).toHaveBeenCalledTimes(2);
  });

  it("misses cache for different target", async () => {
    seedStorage({ deeplApiKey: "key123" });
    const { translate } = await importTranslator();

    await translate(request({ text: "same", target: "ja" }));
    await translate(request({ text: "same", target: "en" }));

    expect(translateText).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest entry after more than 100 cache entries", async () => {
    seedStorage({ deeplApiKey: "key123" });
    translateText.mockImplementation(async ({ text }) => `tx:${text}`);
    const { translate } = await importTranslator();

    for (let index = 0; index < 101; index += 1) {
      await translate(request({ text: `text-${index}` }));
    }
    expect(translateText).toHaveBeenCalledTimes(101);

    await expect(translate(request({ text: "text-0" }))).resolves.toBe("tx:text-0");
    expect(translateText).toHaveBeenCalledTimes(102);

    await expect(translate(request({ text: "text-50" }))).resolves.toBe("tx:text-50");
    expect(translateText).toHaveBeenCalledTimes(102);
  });

  it("promotes recently read entries before eviction", async () => {
    seedStorage({ deeplApiKey: "key123" });
    translateText.mockImplementation(async ({ text }) => `tx:${text}`);
    const { translate } = await importTranslator();

    await translate(request({ text: "A" }));
    for (let index = 0; index < 99; index += 1) {
      await translate(request({ text: `B-${index}` }));
    }
    await expect(translate(request({ text: "A" }))).resolves.toBe("tx:A");
    await translate(request({ text: "C" }));

    expect(translateText).toHaveBeenCalledTimes(101);
    await expect(translate(request({ text: "A" }))).resolves.toBe("tx:A");
    expect(translateText).toHaveBeenCalledTimes(101);
  });
});

describe("fetchUsage", () => {
  it.each(["key-x", "  key-x  "])("uses a trimmed override key %#", async (key) => {
    const { fetchUsage } = await importTranslator();

    await expect(fetchUsage({ key })).resolves.toEqual({
      character_count: 100,
      character_limit: 500000,
    });

    expect(getUsage).toHaveBeenCalledWith("key-x");
  });

  it.each(["", "   "])("rejects blank override without reading storage %#", async (key) => {
    const area = chrome.storage.local as unknown as MockChromeStorageArea;
    const { fetchUsage } = await importTranslator();

    await expect(fetchUsage({ key })).rejects.toMatchObject({ code: "MISSING_KEY" });

    expect(area.get).not.toHaveBeenCalled();
    expect(getUsage).not.toHaveBeenCalled();
  });

  it("uses the saved key when no override is provided", async () => {
    seedStorage({ deeplApiKey: "saved-key" });
    const { fetchUsage } = await importTranslator();

    await fetchUsage();

    expect(getUsage).toHaveBeenCalledWith("saved-key");
  });

  it("throws MISSING_KEY when no saved key exists", async () => {
    seedStorage({ deeplApiKey: undefined });
    const { fetchUsage } = await importTranslator();

    await expect(fetchUsage()).rejects.toBeInstanceOf(DeepLError);
    await expect(fetchUsage()).rejects.toMatchObject({ code: "MISSING_KEY" });
  });
});
