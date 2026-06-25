import type { TranslateSelectionRequest } from "../shared/messages";
import { STORAGE_KEY, defaultState, readStorageState } from "../shared/messages";

export async function ensureStorageInitialized(): Promise<void> {
  const [localResult, syncResult] = await Promise.all([
    chrome.storage.local.get(STORAGE_KEY),
    chrome.storage.sync.get(STORAGE_KEY),
  ]);

  const hasLocalState = Object.prototype.hasOwnProperty.call(localResult, STORAGE_KEY);
  const hasSyncState = Object.prototype.hasOwnProperty.call(syncResult, STORAGE_KEY);

  if (hasLocalState) {
    if (hasSyncState) {
      await chrome.storage.sync.remove(STORAGE_KEY);
    }
    return;
  }

  if (hasSyncState) {
    await chrome.storage.local.set({ [STORAGE_KEY]: syncResult[STORAGE_KEY] });
    await chrome.storage.sync.remove(STORAGE_KEY);
    return;
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: defaultState });
}

void ensureStorageInitialized().catch((err: unknown) => {
  console.error("[hover-translate] storage init failed", err);
});

chrome.runtime.onInstalled.addListener(() => {
  ensureStorageInitialized().catch((err: unknown) => {
    console.error("[hover-translate] storage init failed", err);
  });
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "translate-selection") return;

  void (async () => {
    const current = await readStorageState();
    if (!current.enabled || current.mode !== "selection" || current.selectionTrigger !== "shortcut") {
      return;
    }

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id !== undefined) {
      try {
        const message: TranslateSelectionRequest = {
          type: "TRANSLATE_SELECTION",
        };
        await chrome.tabs.sendMessage(activeTab.id, message);
      } catch {
        // Tabs without our content script (chrome://, web store) can't receive.
      }
    }
  })();
});
