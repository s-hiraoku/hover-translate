import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "../shared/messages";

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
      sendMessage: vi.fn(async () => undefined),
    },
  };

  (globalThis as { chrome: typeof chrome }).chrome = chromeMock as unknown as typeof chrome;
  return chromeMock;
}

async function importServiceWorker(chromeMock: MockChrome): Promise<void> {
  vi.resetModules();
  translate.mockReset();
  fetchUsage.mockReset();
  translate.mockResolvedValue("translated");
  fetchUsage.mockResolvedValue({ character_count: 100, character_limit: 500000 });
  (globalThis as { chrome: typeof chrome }).chrome = chromeMock as unknown as typeof chrome;
  await import("./service-worker");
}

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("storage initialization race rejection paths", () => {
  it("logs cold-start storage.local.get rejection without writing local state", async () => {
    const chromeMock = installChromeMock();
    const error = new Error("local read failed");
    chromeMock.storage.local.get.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await importServiceWorker(chromeMock);
    await flushAsyncWork();

    expect(consoleError).toHaveBeenCalledWith("[hover-translate] storage init failed", error);
    expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
  });

  it("logs onInstalled sync cleanup rejection without surfacing an unhandled rejection", async () => {
    const chromeMock = installChromeMock();
    chromeMock.storage.local.data[STORAGE_KEY] = { enabled: false };
    chromeMock.storage.sync.data[STORAGE_KEY] = { enabled: true };
    const error = new Error("sync cleanup failed");
    chromeMock.storage.sync.remove.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await importServiceWorker(chromeMock);
    await flushAsyncWork();
    await expect(chromeMock.runtime.onInstalled._emit()).resolves.toEqual([undefined]);
    await flushAsyncWork();

    expect(consoleError).toHaveBeenCalledWith("[hover-translate] storage init failed", error);
  });
});
