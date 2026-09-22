import type { BuiltInTranslator, TranslatorPair } from "../shared/browser-ai";
import {
  createTranslator,
  hasBuiltInTranslator,
  isUserActivationError,
  translatorAvailability,
} from "../shared/browser-ai";
import type { TranslateErrorCode } from "../shared/messages";
import { detectLanguages } from "../shared/languages";

export type PopupTranslateResult =
  | { status: "idle" }
  | { status: "running"; generation: number; source: string; pair: TranslatorPair }
  | { status: "done"; generation: number; source: string; pair: TranslatorPair; text: string }
  | {
      status: "error";
      generation: number;
      source: string;
      pair: TranslatorPair;
      code: TranslateErrorCode;
    };

type PopupTranslateRunning = Extract<PopupTranslateResult, { status: "running" }>;

function translateError(
  generation: number,
  source: string,
  pair: TranslatorPair,
  code: TranslateErrorCode,
): PopupTranslateResult {
  return { status: "error", generation, source, pair, code };
}

export function directionLabel(pair: TranslatorPair): string {
  return pair.sourceLanguage === "en" ? "EN \u2192 JA" : "JA \u2192 EN";
}

export function beginPopupTranslate(
  draft: string,
  maxChars: number,
  generation: number,
): PopupTranslateResult {
  const source = draft.trim();
  if (source.length === 0) {
    return { status: "idle" };
  }

  const [sourceLanguage, targetLanguage] = detectLanguages(source);
  const pair: TranslatorPair = { sourceLanguage, targetLanguage };
  if (source.length > maxChars) {
    return translateError(generation, source, pair, "TEXT_TOO_LONG");
  }

  return { status: "running", generation, source, pair };
}

export async function runPopupTranslate(
  cache: Map<string, Promise<BuiltInTranslator>>,
  running: PopupTranslateRunning,
): Promise<PopupTranslateResult> {
  const { generation, source, pair } = running;

  try {
    const availability = await translatorAvailability(pair);
    if (availability === "unavailable") {
      return translateError(
        generation,
        source,
        pair,
        hasBuiltInTranslator() ? "LANGUAGE_PACK_UNAVAILABLE" : "TRANSLATOR_UNSUPPORTED",
      );
    }

    if (availability !== "available") {
      return translateError(generation, source, pair, "LANGUAGE_PACK_DOWNLOAD_REQUIRED");
    }

    const key = `${pair.sourceLanguage}:${pair.targetLanguage}`;
    let session = cache.get(key);
    if (!session) {
      session = createTranslator(pair).catch((error: unknown) => {
        cache.delete(key);
        throw error;
      });
      cache.set(key, session);
    }

    const translator = await session;
    const text = await translator.translate(source);
    return { status: "done", generation, source, pair, text };
  } catch (error) {
    return translateError(
      generation,
      source,
      pair,
      isUserActivationError(error) ? "LANGUAGE_PACK_DOWNLOAD_REQUIRED" : "UNKNOWN",
    );
  }
}
