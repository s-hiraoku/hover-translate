import type { DeepLUsage, TranslateRequest } from "../shared/messages";
import { readStorageState } from "../shared/messages";
import { DeepLError, getUsage, translateText } from "./deepl-client";

const CACHE_MAX = 100;

// MV3 service workers can terminate at any time, so this cache is best-effort only.
const cache = new Map<string, string>();

function cacheKey(args: {
  sourceLang: "EN" | "JA";
  targetLang: "EN-US" | "EN-GB" | "JA";
  text: string;
  context?: string;
}): string {
  return JSON.stringify([args.sourceLang, args.targetLang, args.text, args.context ?? ""]);
}

function cacheGet(key: string): string | undefined {
  const value = cache.get(key);
  if (value === undefined) return undefined;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function cacheSet(key: string, value: string): void {
  if (!cache.has(key) && cache.size >= CACHE_MAX) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey === "string") {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, value);
}

export async function translate(req: TranslateRequest): Promise<string> {
  const state = await readStorageState();

  if (!state.deeplApiKey) {
    throw new DeepLError("MISSING_KEY", "DeepL API key not set");
  }

  if (req.text.length > state.maxChars) {
    throw new DeepLError("TEXT_TOO_LONG", `text too long: ${req.text.length}`);
  }

  const sourceLang = req.source === "ja" ? "JA" : "EN";
  const targetLang = req.target === "ja" ? "JA" : state.targetEnglish;
  const key = cacheKey({
    sourceLang,
    targetLang,
    text: req.text,
    context: req.context,
  });
  const cached = cacheGet(key);
  if (cached !== undefined) {
    return cached;
  }

  const translated = await translateText({
    key: state.deeplApiKey,
    text: req.text,
    context: req.context,
    sourceLang,
    targetLang,
  });

  cacheSet(key, translated);
  return translated;
}

export async function fetchUsage(override?: { key: string }): Promise<DeepLUsage> {
  if (override) {
    const trimmed = override.key.trim();
    if (!trimmed) {
      throw new DeepLError("MISSING_KEY", "DeepL API key not set");
    }
    return getUsage(trimmed);
  }

  const state = await readStorageState();
  if (!state.deeplApiKey) {
    throw new DeepLError("MISSING_KEY", "DeepL API key not set");
  }

  return getUsage(state.deeplApiKey);
}
