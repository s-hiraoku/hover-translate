export type SourceLang = "en" | "ja";
export type TargetLang = "en" | "ja";
export type Mode = "hover" | "selection";
export type SelectionTrigger = "shortcut" | "auto";

export interface TranslateRequest {
  type: "TRANSLATE";
  text: string;
  context?: string;
  source: SourceLang;
  target: TargetLang;
}

export interface TranslateResponse {
  ok: boolean;
  translated?: string;
  errorCode?: TranslateErrorCode;
  error?: string;
}

export interface StorageState {
  enabled: boolean;
  mode: Mode;
  selectionTrigger: SelectionTrigger;
  deeplApiKey?: string;
  targetEnglish: "EN-US" | "EN-GB";
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
  targetEnglish: "EN-US",
  maxChars: DEFAULT_MAX_CHARS,
};

export type TranslateErrorCode =
  | "MISSING_KEY"
  | "INVALID_KEY"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "NETWORK_ERROR"
  | "TEXT_TOO_LONG"
  | "UNKNOWN";

export interface DeepLTranslateResult {
  translations: {
    detected_source_language: string;
    text: string;
  }[];
}

export interface DeepLUsage {
  character_count: number;
  character_limit: number;
}

export interface TestKeyRequest {
  type: "TEST_KEY";
  key: string;
}

export interface TestKeyResponse {
  ok: boolean;
  usage?: DeepLUsage;
  errorCode?: TranslateErrorCode;
  error?: string;
}

export interface GetUsageRequest {
  type: "GET_USAGE";
}

export type GetUsageResponse = TestKeyResponse;

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

function normalizeTargetEnglish(value: unknown): StorageState["targetEnglish"] {
  return value === "EN-US" || value === "EN-GB" ? value : defaultState.targetEnglish;
}

export function normalizeState(stored: unknown): StorageState {
  if (!isRecord(stored)) {
    return defaultState;
  }

  const deeplApiKey =
    typeof stored.deeplApiKey === "string" ? stored.deeplApiKey.trim() || undefined : undefined;

  return {
    enabled: stored.enabled === true,
    mode: normalizeMode(stored.mode),
    selectionTrigger: normalizeSelectionTrigger(stored.selectionTrigger),
    targetEnglish: normalizeTargetEnglish(stored.targetEnglish),
    maxChars: clampMaxChars(Number(stored.maxChars)),
    deeplApiKey,
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

interface ErrorResponse {
  ok: false;
  errorCode: TranslateErrorCode;
  error: string;
}

export function buildErrorResponse(err: unknown): ErrorResponse {
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    const code = (err as { code: TranslateErrorCode }).code;
    return { ok: false, errorCode: code, error: messageForCode(code) };
  }
  const error = err instanceof Error ? err.message : String(err);
  return { ok: false, errorCode: "UNKNOWN", error };
}

export function resolveErrorMessage(
  response: TranslateResponse,
  maxChars?: number,
): string {
  if (response.errorCode) return messageForCode(response.errorCode, maxChars);
  return response.error ?? "Translation failed.";
}

export function messageForCode(code: TranslateErrorCode, maxChars?: number): string {
  switch (code) {
    case "MISSING_KEY":
      return "Set your DeepL API key from the extension popup.";
    case "INVALID_KEY":
      return "Invalid DeepL API key. Check the key in the popup.";
    case "QUOTA_EXCEEDED":
      return "DeepL free quota exceeded this period.";
    case "RATE_LIMITED":
      return "DeepL rate limit hit. Slow down and try again.";
    case "SERVER_ERROR":
      return "DeepL is temporarily unavailable. Try again shortly.";
    case "NETWORK_ERROR":
      return "Network error reaching DeepL.";
    case "TEXT_TOO_LONG":
      return `Text too long (max ${maxChars ?? DEFAULT_MAX_CHARS} chars).`;
    case "UNKNOWN":
      return "Translation failed.";
  }
}
