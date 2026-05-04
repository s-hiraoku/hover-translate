import { beforeEach, describe, expect, it, vi } from "vitest";
import { installChromeMock } from "../test/chrome-mock";
import type { ChromeMock } from "../test/chrome-mock";
import type {
  StorageState,
  TestKeyRequest,
  TranslateRequest,
} from "../shared/messages";
import { STORAGE_KEY, defaultState } from "../shared/messages";

const { fetchUsage, translate } = vi.hoisted(() => ({
  fetchUsage: vi.fn<typeof import("./translator").fetchUsage>(),
  translate: vi.fn<typeof import("./translator").translate>(),
}));

vi.mock("./translator", () => ({
  translate,
  fetchUsage,
}));

async function importServiceWorker(args: { flush?: boolean } = {}): Promise<ChromeMock> {
  vi.resetModules();
  const chromeMock = installChromeMock();
  translate.mockReset();
  fetchUsage.mockReset();
  translate.mockResolvedValue("translated");
  fetchUsage.mockResolvedValue({ character_count: 100, character_limit: 500000 });
  await import("./service-worker");
  if (args.flush !== false) {
    await flushAsyncWork();
  }
  return chromeMock;
}

async function flushAsyncWork(): Promise<void> {
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

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("commands.onCommand extra coverage", () => {
  it.each(["foo", ""])("ignores unknown command name %# without querying tabs", async (command) => {
    const chromeMock = await importServiceWorker();
    const querySpy = vi.spyOn(chromeMock.tabs, "query");
    const sendMessageSpy = vi.spyOn(chromeMock.tabs, "sendMessage");
    seed(chromeMock.storage.local, {
      enabled: true,
      mode: "selection",
      selectionTrigger: "shortcut",
    });

    await chromeMock.commands.onCommand._emit(command);
    await flushAsyncWork();

    expect(querySpy).not.toHaveBeenCalled();
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it("does not send when translate-selection has no active tab", async () => {
    const chromeMock = await importServiceWorker();
    const sendMessageSpy = vi.spyOn(chromeMock.tabs, "sendMessage");
    seed(chromeMock.storage.local, {
      enabled: true,
      mode: "selection",
      selectionTrigger: "shortcut",
    });

    chromeMock.commands.onCommand._emit("translate-selection");
    await flushAsyncWork();

    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it("does not send when the active tab id is undefined", async () => {
    const chromeMock = await importServiceWorker();
    const sendMessageSpy = vi.spyOn(chromeMock.tabs, "sendMessage");
    seed(chromeMock.storage.local, {
      enabled: true,
      mode: "selection",
      selectionTrigger: "shortcut",
    });
    chromeMock.tabs._setActive([{ id: undefined } as chrome.tabs.Tab]);

    await chromeMock.commands.onCommand._emit("translate-selection");
    await flushAsyncWork();

    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  // Auto-trigger no-send is covered by the settings table in service-worker.test.ts.
});

describe("runtime messages extra coverage", () => {
  // Unknown message routing is covered in service-worker.test.ts.

  it("maps non-DeepLError TRANSLATE rejection to UNKNOWN with the original message", async () => {
    const chromeMock = await importServiceWorker();
    translate.mockRejectedValue(new Error("plain error"));

    await expect(
      chromeMock.runtime.sendMessage({
        type: "TRANSLATE",
        text: "hello",
        source: "en",
        target: "ja",
      } satisfies TranslateRequest),
    ).resolves.toEqual({
      ok: false,
      errorCode: "UNKNOWN",
      error: "plain error",
    });
  });

  it("maps non-Error TEST_KEY rejection to UNKNOWN with a string message", async () => {
    const chromeMock = await importServiceWorker();
    fetchUsage.mockRejectedValue("nope");

    await expect(
      chromeMock.runtime.sendMessage({ type: "TEST_KEY", key: "abc" } satisfies TestKeyRequest),
    ).resolves.toEqual({
      ok: false,
      errorCode: "UNKNOWN",
      error: "nope",
    });
  });

});

describe("storage initialization extra coverage", () => {
  it("does not corrupt local storage when cold start and onInstalled initialization overlap", async () => {
    const chromeMock = await importServiceWorker();
    seed(chromeMock.storage.sync, { enabled: true, deeplApiKey: "sync-key" });
    // The shared chrome mock's `set` is a plain function, not a vi.fn();
    // wrap it now so we can count calls during the onInstalled re-entry.
    const setSpy = vi.spyOn(chromeMock.storage.local, "set");

    await chromeMock.runtime.onInstalled._emit();
    await flushAsyncWork();

    const state = await readLocalState();
    expect(state).toEqual(defaultState);
    expect(chromeMock.storage.sync._dump()[STORAGE_KEY]).toBeUndefined();
    // Cold-start already wrote defaultState before this spy attached.
    // onInstalled sees existing local state and must not write again.
    expect(setSpy).toHaveBeenCalledTimes(0);
  });
});
