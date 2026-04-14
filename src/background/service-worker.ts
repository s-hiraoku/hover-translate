import type {
  GetUsageRequest,
  GetUsageResponse,
  StorageState,
  TestKeyRequest,
  TestKeyResponse,
  ToggleToastRequest,
  TranslateRequest,
  TranslateResponse,
} from "../shared/messages";
import {
  STORAGE_KEY,
  buildErrorResponse,
  defaultState,
  readStorageState,
} from "../shared/messages";
import { fetchUsage, translate } from "./translator";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.get(STORAGE_KEY).then((result) => {
    if (!result[STORAGE_KEY]) {
      void chrome.storage.local.set({ [STORAGE_KEY]: defaultState });
    }
  });
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-enabled") return;

  void (async () => {
    const current = await readStorageState();
    const next: StorageState = { ...current, enabled: !current.enabled };
    await chrome.storage.local.set({ [STORAGE_KEY]: next });

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id !== undefined) {
      try {
        const toastMessage: ToggleToastRequest = {
          type: "TOGGLE_TOAST",
          enabled: next.enabled,
        };
        await chrome.tabs.sendMessage(activeTab.id, toastMessage);
      } catch {
        // Tabs without our content script (chrome://, web store) can't receive.
      }
    }
  })();
});

chrome.runtime.onMessage.addListener(
  (
    message: TranslateRequest | TestKeyRequest | GetUsageRequest,
    _sender,
    sendResponse: (res: TranslateResponse | TestKeyResponse | GetUsageResponse) => void,
  ) => {
    if (message?.type === "TEST_KEY") {
      fetchUsage(message.key)
        .then((usage) => sendResponse({ ok: true, usage }))
        .catch((err: unknown) => sendResponse(buildErrorResponse(err)));
      return true;
    }

    if (message?.type === "GET_USAGE") {
      fetchUsage()
        .then((usage) => sendResponse({ ok: true, usage }))
        .catch((err: unknown) => sendResponse(buildErrorResponse(err)));
      return true;
    }

    if (message?.type !== "TRANSLATE") return false;

    translate(message)
      .then((translated) => sendResponse({ ok: true, translated }))
      .catch((err: unknown) => sendResponse(buildErrorResponse(err)));

    return true;
  },
);
