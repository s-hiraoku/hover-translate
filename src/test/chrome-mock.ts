type StorageAreaName = "local" | "sync" | "managed" | "session";
type StorageValue = Record<string, unknown>;
type StorageGetKeys = string | string[] | StorageValue | null | undefined;
type StorageChange = chrome.storage.StorageChange;
type StorageChanges = Record<string, StorageChange>;
type StorageChangedListener = (changes: StorageChanges, areaName: StorageAreaName) => void;
type RuntimeSendResponse = (response?: unknown) => void;
type RuntimeMessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: RuntimeSendResponse,
) => boolean | void | Promise<unknown> | unknown;
type RuntimeInstalledListener = () => void | Promise<void>;
type CommandListener = (command: string) => void;
type TabMessage = {
  tabId: number;
  message: unknown;
};

interface MockStorageArea {
  get: (keys?: StorageGetKeys) => Promise<StorageValue>;
  set: (items: StorageValue) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
  clear: () => Promise<void>;
  _dump: () => StorageValue;
}

interface MockEvent<TListener> {
  addListener: (cb: TListener) => void;
  removeListener: (cb: TListener) => void;
}

export interface ChromeMock {
  storage: {
    local: MockStorageArea;
    sync: MockStorageArea;
    onChanged: MockEvent<StorageChangedListener> & {
      _emit: (changes: StorageChanges, areaName: StorageAreaName) => void;
    };
  };
  runtime: {
    sendMessage: (message: unknown) => Promise<unknown>;
    onMessage: MockEvent<RuntimeMessageListener> & {
      _emit: (message: unknown, sender?: chrome.runtime.MessageSender) => Promise<unknown>;
    };
    onInstalled: MockEvent<RuntimeInstalledListener> & {
      _emit: () => Promise<void>;
    };
  };
  commands?: {
    onCommand: MockEvent<CommandListener> & {
      _emit: (command: string) => void;
    };
  };
  tabs?: {
    sentMessages: TabMessage[];
    sendMessage: (tabId: number, message: unknown) => Promise<unknown>;
  };
}

function cloneValue<T>(value: T): T {
  if (value === undefined) return value;
  return structuredClone(value);
}

function makeListenerSet<TListener>() {
  const listeners = new Set<TListener>();
  return {
    listeners,
    addListener(cb: TListener) {
      listeners.add(cb);
    },
    removeListener(cb: TListener) {
      listeners.delete(cb);
    },
  };
}

function hasOwnValue(store: Map<string, unknown>, key: string): boolean {
  return store.has(key);
}

function buildGetResult(store: Map<string, unknown>, keys?: StorageGetKeys): StorageValue {
  if (keys === null || keys === undefined) {
    return Object.fromEntries(Array.from(store.entries(), ([key, value]) => [key, cloneValue(value)]));
  }

  if (typeof keys === "string") {
    return hasOwnValue(store, keys) ? { [keys]: cloneValue(store.get(keys)) } : {};
  }

  if (Array.isArray(keys)) {
    return keys.reduce<StorageValue>((result, key) => {
      if (hasOwnValue(store, key)) result[key] = cloneValue(store.get(key));
      return result;
    }, {});
  }

  return Object.fromEntries(
    Object.entries(keys).map(([key, defaultValue]) => [
      key,
      hasOwnValue(store, key) ? cloneValue(store.get(key)) : cloneValue(defaultValue),
    ]),
  );
}

function createStorageArea(
  areaName: StorageAreaName,
  emitChanged: (changes: StorageChanges, areaName: StorageAreaName) => void,
): MockStorageArea {
  const store = new Map<string, unknown>();

  return {
    async get(keys?: StorageGetKeys) {
      return buildGetResult(store, keys);
    },
    async set(items: StorageValue) {
      const changes = Object.entries(items).reduce<StorageChanges>((result, [key, value]) => {
        const oldValue = store.get(key);
        store.set(key, cloneValue(value));
        result[key] = { oldValue: cloneValue(oldValue), newValue: cloneValue(value) };
        return result;
      }, {});
      if (Object.keys(changes).length > 0) emitChanged(changes, areaName);
    },
    async remove(keys: string | string[]) {
      const keyList = Array.isArray(keys) ? keys : [keys];
      const changes = keyList.reduce<StorageChanges>((result, key) => {
        if (!store.has(key)) return result;
        const oldValue = store.get(key);
        store.delete(key);
        result[key] = { oldValue: cloneValue(oldValue) };
        return result;
      }, {});
      if (Object.keys(changes).length > 0) emitChanged(changes, areaName);
    },
    async clear() {
      const changes = Array.from(store.entries()).reduce<StorageChanges>((result, [key, oldValue]) => {
        result[key] = { oldValue: cloneValue(oldValue) };
        return result;
      }, {});
      store.clear();
      if (Object.keys(changes).length > 0) emitChanged(changes, areaName);
    },
    _dump() {
      return buildGetResult(store);
    },
  };
}

function createRuntime(onMessageListeners: Set<RuntimeMessageListener>) {
  async function emitMessage(
    message: unknown,
    sender: chrome.runtime.MessageSender = {},
  ): Promise<unknown> {
    for (const listener of onMessageListeners) {
      let responseSet = false;
      let responseValue: unknown;
      let resolveAsyncResponse: (response: unknown) => void = () => undefined;
      const asyncResponse = new Promise<unknown>((resolve) => {
        resolveAsyncResponse = resolve;
      });
      const sendResponse: RuntimeSendResponse = (response?: unknown) => {
        responseSet = true;
        responseValue = response;
        resolveAsyncResponse(response);
      };
      const returned = listener(message, sender, sendResponse);

      if (returned instanceof Promise) {
        const awaited = await returned;
        return responseSet ? responseValue : awaited;
      }

      if (responseSet) return responseValue;
      if (returned === true) return await asyncResponse;
      if (returned !== undefined && returned !== false) return returned;
    }

    return undefined;
  }

  return {
    sendMessage(message: unknown) {
      return emitMessage(message);
    },
    emitMessage,
  };
}

export function createChromeMock(): ChromeMock {
  const storageChanged = makeListenerSet<StorageChangedListener>();
  const messageEvent = makeListenerSet<RuntimeMessageListener>();
  const installedEvent = makeListenerSet<RuntimeInstalledListener>();
  const commandEvent = makeListenerSet<CommandListener>();
  const runtime = createRuntime(messageEvent.listeners);

  const emitStorageChanged = (changes: StorageChanges, areaName: StorageAreaName) => {
    storageChanged.listeners.forEach((listener) => {
      listener(changes, areaName);
    });
  };

  const sentMessages: TabMessage[] = [];

  return {
    storage: {
      local: createStorageArea("local", emitStorageChanged),
      sync: createStorageArea("sync", emitStorageChanged),
      onChanged: {
        addListener: storageChanged.addListener,
        removeListener: storageChanged.removeListener,
        _emit: emitStorageChanged,
      },
    },
    runtime: {
      sendMessage: runtime.sendMessage,
      onMessage: {
        addListener: messageEvent.addListener,
        removeListener: messageEvent.removeListener,
        _emit: runtime.emitMessage,
      },
      onInstalled: {
        addListener: installedEvent.addListener,
        removeListener: installedEvent.removeListener,
        async _emit() {
          await Promise.all(Array.from(installedEvent.listeners, (listener) => listener()));
        },
      },
    },
    commands: {
      onCommand: {
        addListener: commandEvent.addListener,
        removeListener: commandEvent.removeListener,
        _emit(command: string) {
          commandEvent.listeners.forEach((listener) => {
            listener(command);
          });
        },
      },
    },
    tabs: {
      sentMessages,
      async sendMessage(tabId: number, message: unknown) {
        sentMessages.push({ tabId, message });
        return runtime.emitMessage(message, { tab: { id: tabId } as chrome.tabs.Tab });
      },
    },
  };
}

export function installChromeMock(): ChromeMock {
  const mock = createChromeMock();
  (globalThis as unknown as { chrome: ChromeMock }).chrome = mock;
  return mock;
}
