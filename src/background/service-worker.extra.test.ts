import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  StorageState,
  TestKeyRequest,
  TranslateRequest,
} from "../shared/messages";
import { STORAGE_KEY, defaultState } from "../shared/messages";

interface MockStorageArea {
  data: Record<string, unknown>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

interface MockEvent<Listener extends (...args: never[]) => unknown> {
  addListener: ReturnType<typeof vi.fn>;
  _emit: (...args: Parameters<Listener>) => Promise<unknown[]>;
  _listeners: Listener[];
}

interface MockChrome {
  runtime: {
    onInstalled: MockEvent<() => void>;
    onMessage: MockEvent<
      (
        message: unknown,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: unknown) => void,
      ) => boolean | undefined
    >;
    sendMessage: ReturnType<typeof vi.fn>;
  };
  commands: {
    onCommand: MockEvent<(command: string) => void>;
  };
  storage: {
    local: MockStorageArea;
    sync: MockStorageArea;
  };
  tabs: {
    query: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    sentMessages: { tabId: number; message: unknown }[];
  };
}

const { fetchUsage, translate } = vi.hoisted(() => ({
  fetchUsage: vi.fn<typeof import("./translator").fetchUsage>(),
  translate: vi.fn<typeof import("./translator").translate>(),
}));

vi.mock("./translator", () => ({
  translate,
  fetchUsage,
}));

function createEvent<Listener extends (...args: never[]) => unknown>(): MockEvent<Listener> {
  const listeners: Listener[] = [];
  return {
    _listeners: listeners,
    addListener: vi.fn((listener: Listener) => {
      listeners.push(listener);
    }),
    _emit: async (...args: Parameters<Listener>) =>
      Promise.all(listeners.map(async (listener) => listener(...args))),
  };
}

function createStorageArea(): MockStorageArea {
  const area: MockStorageArea = {
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

function installChromeMock(): MockChrome {
  const chromeMock: MockChrome = {
    runtime: {
      onInstalled: createEvent<() => void>(),
      onMessage:
        createEvent<
          (
            message: unknown,
            sender: chrome.runtime.MessageSender,
            sendResponse: (response: unknown) => void,
          ) => boolean | undefined
        >(),
      sendMessage: vi.fn(async (message: unknown) => {
        for (const listener of chromeMock.runtime.onMessage._listeners) {
          const response = await new Promise<unknown>((resolve) => {
            const handled = listener(message, {}, resolve);
            if (!handled) resolve(undefined);
          });
          if (response !== undefined) return response;
        }
        return undefined;
      }),
    },
    commands: {
      onCommand: createEvent<(command: string) => void>(),
    },
    storage: {
      local: createStorageArea(),
      sync: createStorageArea(),
    },
    tabs: {
      query: vi.fn(async () => []),
      sendMessage: vi.fn(async (tabId: number, message: unknown) => {
        chromeMock.tabs.sentMessages.push({ tabId, message });
      }),
      sentMessages: [],
    },
  };

  (globalThis as { chrome: typeof chrome }).chrome = chromeMock as unknown as typeof chrome;
  return chromeMock;
}

async function importServiceWorker(args: { flush?: boolean } = {}): Promise<MockChrome> {
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

function seed(area: MockStorageArea, state: Partial<StorageState>): void {
  area.data[STORAGE_KEY] = { ...defaultState, ...state };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("commands.onCommand extra coverage", () => {
  it.each(["foo", ""])("ignores unknown command name %# without querying tabs", async (command) => {
    const chromeMock = await importServiceWorker();
    seed(chromeMock.storage.local, {
      enabled: true,
      mode: "selection",
      selectionTrigger: "shortcut",
    });

    await chromeMock.commands.onCommand._emit(command);
    await flushAsyncWork();

    expect(chromeMock.tabs.query).not.toHaveBeenCalled();
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it("does not send when translate-selection has no active tab", async () => {
    const chromeMock = await importServiceWorker();
    seed(chromeMock.storage.local, {
      enabled: true,
      mode: "selection",
      selectionTrigger: "shortcut",
    });
    chromeMock.tabs.query.mockResolvedValue([]);

    await expect(chromeMock.commands.onCommand._emit("translate-selection")).resolves.toEqual([
      undefined,
    ]);
    await flushAsyncWork();

    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it("does not send when the active tab id is undefined", async () => {
    const chromeMock = await importServiceWorker();
    seed(chromeMock.storage.local, {
      enabled: true,
      mode: "selection",
      selectionTrigger: "shortcut",
    });
    chromeMock.tabs.query.mockResolvedValue([{ id: undefined }]);

    await chromeMock.commands.onCommand._emit("translate-selection");
    await flushAsyncWork();

    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it("does not send keyboard command when selectionTrigger is auto", async () => {
    const chromeMock = await importServiceWorker();
    seed(chromeMock.storage.local, {
      enabled: true,
      mode: "selection",
      selectionTrigger: "auto",
    });
    chromeMock.tabs.query.mockResolvedValue([{ id: 42 }]);

    await chromeMock.commands.onCommand._emit("translate-selection");
    await flushAsyncWork();

    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled();
  });
});

describe("runtime messages extra coverage", () => {
  it("returns false explicitly for unknown message types", async () => {
    const chromeMock = await importServiceWorker();
    const listener = chromeMock.runtime.onMessage._listeners[0];

    const result = listener?.({ type: "UNKNOWN" }, {}, vi.fn());

    expect(result).toBe(false);
  });

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
    const chromeMock = await importServiceWorker({ flush: false });
    seed(chromeMock.storage.sync, { enabled: true, deeplApiKey: "sync-key" });

    await chromeMock.runtime.onInstalled._emit();
    await flushAsyncWork();

    const state = await readLocalState();
    expect([defaultState, { ...defaultState, enabled: true, deeplApiKey: "sync-key" }]).toContainEqual(
      state,
    );
  });
});
