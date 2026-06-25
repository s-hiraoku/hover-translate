import { beforeEach, describe, expect, it, vi } from "vitest";
import { installChromeMock } from "../test/chrome-mock";
import type { ChromeMock } from "../test/chrome-mock";
import type { StorageState } from "../shared/messages";
import { STORAGE_KEY, defaultState } from "../shared/messages";

async function importServiceWorker(): Promise<ChromeMock> {
  vi.resetModules();
  const chromeMock = installChromeMock();
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
    seed(chromeMock.storage.local, { enabled: true });

    await chromeMock.runtime.onInstalled._emit();
    await flushAsyncWork();

    await expect(readLocalState()).resolves.toMatchObject({
      enabled: true,
    });
  });

  it("migrates sync state to local on install", async () => {
    const chromeMock = await importServiceWorker();
    await chromeMock.storage.local.clear();
    seed(chromeMock.storage.sync, { enabled: true });

    await chromeMock.runtime.onInstalled._emit();
    await flushAsyncWork();

    await expect(readLocalState()).resolves.toMatchObject({
      enabled: true,
    });
    expect(chromeMock.storage.sync._dump()[STORAGE_KEY]).toBeUndefined();
  });

  it("keeps local state and removes sync state when both exist on install", async () => {
    const chromeMock = await importServiceWorker();
    seed(chromeMock.storage.local, { enabled: true });
    seed(chromeMock.storage.sync, { enabled: false });

    await chromeMock.runtime.onInstalled._emit();
    await flushAsyncWork();

    await expect(readLocalState()).resolves.toMatchObject({ enabled: true });
    expect(chromeMock.storage.sync._dump()[STORAGE_KEY]).toBeUndefined();
  });

  it("initializes default state on cold start", async () => {
    await importServiceWorker();

    await expect(readLocalState()).resolves.toEqual(defaultState);
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
