import { beforeEach, describe, expect, it, vi } from "vitest";
import { installChromeMock } from "../test/chrome-mock";
import type { ChromeMock } from "../test/chrome-mock";
import type {
  DeepLUsage,
  GetUsageRequest,
  StorageState,
  TestKeyRequest,
  TranslateRequest,
} from "../shared/messages";
import { STORAGE_KEY, defaultState } from "../shared/messages";
import { DeepLError } from "./deepl-client";

const { fetchUsage, translate } = vi.hoisted(() => ({
  fetchUsage: vi.fn<() => Promise<DeepLUsage>>(),
  translate: vi.fn<() => Promise<string>>(),
}));

vi.mock("./translator", () => ({
  translate,
  fetchUsage,
}));

async function importServiceWorker(): Promise<ChromeMock> {
  vi.resetModules();
  const chromeMock = installChromeMock();
  translate.mockReset();
  fetchUsage.mockReset();
  translate.mockResolvedValue("translated");
  fetchUsage.mockResolvedValue({ character_count: 100, character_limit: 500000 });
  await import("./service-worker");
  await flushAsyncWork();
  return chromeMock;
}

async function flushAsyncWork(): Promise<void> {
  // The onInstalled / cold-start initializers fire-and-forget the
  // ensureStorageInitialized() promise, so we need enough microtask ticks
  // to drain Promise.all([get,get]) → set chains across both areas.
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
}

async function readLocalState(): Promise<StorageState | undefined> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] as StorageState | undefined;
}

function seed(area: ChromeMock["storage"]["local"], state: Partial<StorageState>): void {
  void area.set({ [STORAGE_KEY]: { ...defaultState, ...state } });
}

describe("storage initialization", () => {
  it("initializes default state on install when storage is empty", async () => {
    const chromeMock = await importServiceWorker();
    await chromeMock.storage.local.clear();

    await chromeMock.runtime.onInstalled._emit();
    await flushAsyncWork();

    await expect(readLocalState()).resolves.toEqual(defaultState);
  });

  it("keeps existing local state on install", async () => {
    const chromeMock = await importServiceWorker();
    seed(chromeMock.storage.local, { enabled: true, deeplApiKey: "local-key" });

    await chromeMock.runtime.onInstalled._emit();
    await flushAsyncWork();

    await expect(readLocalState()).resolves.toMatchObject({
      enabled: true,
      deeplApiKey: "local-key",
    });
  });

  it("migrates sync state to local on install", async () => {
    const chromeMock = await importServiceWorker();
    await chromeMock.storage.local.clear();
    seed(chromeMock.storage.sync, { enabled: true, deeplApiKey: "sync-key" });

    await chromeMock.runtime.onInstalled._emit();
    await flushAsyncWork();

    await expect(readLocalState()).resolves.toMatchObject({
      enabled: true,
      deeplApiKey: "sync-key",
    });
    expect(chromeMock.storage.sync._dump()[STORAGE_KEY]).toBeUndefined();
  });

  it("keeps local state and removes sync state when both exist on install", async () => {
    const chromeMock = await importServiceWorker();
    seed(chromeMock.storage.local, { deeplApiKey: "local-key" });
    seed(chromeMock.storage.sync, { deeplApiKey: "sync-key" });

    await chromeMock.runtime.onInstalled._emit();
    await flushAsyncWork();

    await expect(readLocalState()).resolves.toMatchObject({ deeplApiKey: "local-key" });
    expect(chromeMock.storage.sync._dump()[STORAGE_KEY]).toBeUndefined();
  });

  it("initializes default state on cold start", async () => {
    await importServiceWorker();

    await expect(readLocalState()).resolves.toEqual(defaultState);
  });
});

describe("runtime messages", () => {
  it("responds to TRANSLATE success", async () => {
    const chromeMock = await importServiceWorker();
    translate.mockResolvedValue("こんにちは");

    await expect(
      chromeMock.runtime.sendMessage({
        type: "TRANSLATE",
        text: "hello",
        source: "en",
        target: "ja",
      } satisfies TranslateRequest),
    ).resolves.toEqual({ ok: true, translated: "こんにちは" });
  });

  it("responds to TRANSLATE failure", async () => {
    const chromeMock = await importServiceWorker();
    translate.mockRejectedValue(new DeepLError("INVALID_KEY", "bad"));

    await expect(
      chromeMock.runtime.sendMessage({
        type: "TRANSLATE",
        text: "hello",
        source: "en",
        target: "ja",
      } satisfies TranslateRequest),
    ).resolves.toEqual({
      ok: false,
      errorCode: "INVALID_KEY",
      error: "Invalid DeepL API key. Check the key in the popup.",
    });
  });

  it("responds to TEST_KEY success with object override", async () => {
    const chromeMock = await importServiceWorker();
    const usage = { character_count: 100, character_limit: 500000 };
    fetchUsage.mockResolvedValue(usage);

    await expect(
      chromeMock.runtime.sendMessage({ type: "TEST_KEY", key: "abc" } satisfies TestKeyRequest),
    ).resolves.toEqual({ ok: true, usage });
    expect(fetchUsage).toHaveBeenCalledWith({ key: "abc" });
  });

  it("responds to TEST_KEY failure", async () => {
    const chromeMock = await importServiceWorker();
    fetchUsage.mockRejectedValue(new DeepLError("QUOTA_EXCEEDED", "quota"));

    await expect(
      chromeMock.runtime.sendMessage({ type: "TEST_KEY", key: "abc" } satisfies TestKeyRequest),
    ).resolves.toEqual({
      ok: false,
      errorCode: "QUOTA_EXCEEDED",
      error: "DeepL free quota exceeded this period.",
    });
  });

  it("responds to GET_USAGE by calling fetchUsage without arguments", async () => {
    const chromeMock = await importServiceWorker();
    const usage = { character_count: 100, character_limit: 500000 };
    fetchUsage.mockResolvedValue(usage);

    await expect(
      chromeMock.runtime.sendMessage({ type: "GET_USAGE" } satisfies GetUsageRequest),
    ).resolves.toEqual({ ok: true, usage });
    expect(fetchUsage).toHaveBeenCalledWith();
  });

  it("returns undefined for unknown message types", async () => {
    const chromeMock = await importServiceWorker();

    await expect(chromeMock.runtime.sendMessage({ type: "UNKNOWN" })).resolves.toBeUndefined();
  });
});

describe("commands.onCommand", () => {
  it("sends TRANSLATE_SELECTION to the active tab for the shortcut command", async () => {
    const chromeMock = await importServiceWorker();
    seed(chromeMock.storage.local, {
      enabled: true,
      mode: "selection",
      selectionTrigger: "shortcut",
    });
    chromeMock.tabs._setActive([{ id: 42 } as chrome.tabs.Tab]);

    await chromeMock.commands.onCommand._emit("translate-selection");
    await flushAsyncWork();

    expect(chromeMock.tabs.sentMessages).toEqual([
      { tabId: 42, message: { type: "TRANSLATE_SELECTION" } },
    ]);
  });

  it.each([
    [{ enabled: false, mode: "selection", selectionTrigger: "shortcut" }],
    [{ enabled: true, mode: "hover", selectionTrigger: "shortcut" }],
    [{ enabled: true, mode: "selection", selectionTrigger: "auto" }],
  ] satisfies Partial<StorageState>[][])("does not send when settings are %#", async (state) => {
    const chromeMock = await importServiceWorker();
    seed(chromeMock.storage.local, state);
    chromeMock.tabs._setActive([{ id: 42 } as chrome.tabs.Tab]);

    await chromeMock.commands.onCommand._emit("translate-selection");
    await flushAsyncWork();

    expect(chromeMock.tabs.sentMessages).toEqual([]);
  });

  it("ignores unrelated commands", async () => {
    const chromeMock = await importServiceWorker();
    seed(chromeMock.storage.local, {
      enabled: true,
      mode: "selection",
      selectionTrigger: "shortcut",
    });

    await chromeMock.commands.onCommand._emit("other-command");
    await flushAsyncWork();

    expect(chromeMock.tabs.sentMessages).toEqual([]);
  });

  it("swallows tabs.sendMessage failures", async () => {
    const chromeMock = await importServiceWorker();
    seed(chromeMock.storage.local, {
      enabled: true,
      mode: "selection",
      selectionTrigger: "shortcut",
    });
    chromeMock.tabs._setActive([{ id: 42 } as chrome.tabs.Tab]);
    const sendMessageSpy = vi
      .spyOn(chromeMock.tabs, "sendMessage")
      .mockRejectedValue(new Error("No receiver"));

    chromeMock.commands.onCommand._emit("translate-selection");
    await flushAsyncWork();

    expect(sendMessageSpy).toHaveBeenCalledWith(42, { type: "TRANSLATE_SELECTION" });
  });
});
