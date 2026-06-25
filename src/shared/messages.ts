export type SourceLang = "en" | "ja";
export type TargetLang = "en" | "ja";
export type Mode = "hover" | "selection";
export type SelectionTrigger = "shortcut" | "auto";

export interface StorageState {
  enabled: boolean;
  mode: Mode;
  selectionTrigger: SelectionTrigger;
  maxChars: number;
}

export const STORAGE_KEY = "hoverTranslateState";
export const DEFAULT_MAX_CHARS = 1500;
export const MIN_MAX_CHARS = 500;
export const MAX_MAX_CHARS = 5000;

export const defaultState: StorageState = {
  enabled: false,
  mode: "hover",
  selectionTrigger: "shortcut",
  maxChars: DEFAULT_MAX_CHARS,
};

export type TranslateErrorCode =
  | "TRANSLATOR_UNSUPPORTED"
  | "LANGUAGE_PACK_UNAVAILABLE"
  | "LANGUAGE_PACK_DOWNLOAD_REQUIRED"
  | "TEXT_TOO_LONG"
  | "UNKNOWN";

export interface TranslateSelectionRequest {
  type: "TRANSLATE_SELECTION";
}

export function clampMaxChars(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MAX_CHARS;
  return Math.min(MAX_MAX_CHARS, Math.max(MIN_MAX_CHARS, Math.round(n)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeMode(value: unknown): Mode {
  return value === "hover" || value === "selection" ? value : defaultState.mode;
}

function normalizeSelectionTrigger(value: unknown): SelectionTrigger {
  return value === "shortcut" || value === "auto" ? value : defaultState.selectionTrigger;
}

export function normalizeState(stored: unknown): StorageState {
  if (!isRecord(stored)) {
    return defaultState;
  }

  return {
    enabled: stored.enabled === true,
    mode: normalizeMode(stored.mode),
    selectionTrigger: normalizeSelectionTrigger(stored.selectionTrigger),
    maxChars: clampMaxChars(Number(stored.maxChars)),
  };
}

export async function readStorageState(): Promise<StorageState> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeState(result[STORAGE_KEY]);
}

export async function updateStorageState(
  patch: Partial<StorageState>,
): Promise<StorageState> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const current = normalizeState(result[STORAGE_KEY]);
  const next = normalizeState({ ...current, ...patch });
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

export function messageForCode(code: TranslateErrorCode, maxChars?: number): string {
  switch (code) {
    case "TRANSLATOR_UNSUPPORTED":
      return "Chrome built-in translation is unavailable in this browser. Use desktop Chrome 138 or later.";
    case "LANGUAGE_PACK_UNAVAILABLE":
      return "English-Japanese translation is unavailable on this device.";
    case "LANGUAGE_PACK_DOWNLOAD_REQUIRED":
      return "Language pack download needs a click. Open the popup and press Prepare.";
    case "TEXT_TOO_LONG":
      return `Text too long (max ${maxChars ?? DEFAULT_MAX_CHARS} chars).`;
    case "UNKNOWN":
      return "Translation failed.";
  }
}
