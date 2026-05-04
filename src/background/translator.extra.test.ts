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
        return Object.prototype.hasOwnProperty.call(area.data, key)
          ? { [key]: area.data[key] }
          : {};
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

describe("translate cache extra coverage", () => {
  it("keeps same text/source/target with different context in separate cache entries", async () => {
    seedStorage({ deeplApiKey: "key123" });
    const { translate } = await importTranslator();

    await translate(request({ text: "same", source: "en", target: "ja", context: "formal" }));
    await translate(request({ text: "same", source: "en", target: "ja", context: "casual" }));

    expect(translateText).toHaveBeenCalledTimes(2);
    expect(translateText).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ context: "formal" }),
    );
    expect(translateText).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ context: "casual" }),
    );
  });

  it("keeps EN-US and EN-GB targetEnglish results in separate cache entries", async () => {
    seedStorage({ deeplApiKey: "key123", targetEnglish: "EN-US" });
    const { translate } = await importTranslator();

    await translate(request({ text: "same", source: "ja", target: "en" }));
    seedStorage({ deeplApiKey: "key123", targetEnglish: "EN-GB" });
    await translate(request({ text: "same", source: "ja", target: "en" }));

    expect(translateText).toHaveBeenCalledTimes(2);
    expect(translateText).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ targetLang: "EN-US" }),
    );
    expect(translateText).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ targetLang: "EN-GB" }),
    );
  });

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
    const area = chrome.storage.local as unknown as MockChromeStorageArea;
    seedStorage({ deeplApiKey: "saved-key" });
    const { fetchUsage } = await importTranslator();

    await expect(fetchUsage({ key: " override-key " })).resolves.toEqual({
      character_count: 100,
      character_limit: 500000,
    });

    expect(area.get).not.toHaveBeenCalled();
    expect(getUsage).toHaveBeenCalledWith("override-key");
  });

  it("rejects an empty saved key after normalization", async () => {
    seedStorage({ deeplApiKey: "  " });
    const { fetchUsage } = await importTranslator();

    await expect(fetchUsage()).rejects.toMatchObject({ code: "MISSING_KEY" });

    expect(getUsage).not.toHaveBeenCalled();
  });
});
