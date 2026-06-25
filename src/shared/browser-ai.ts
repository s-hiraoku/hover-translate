import type { SourceLang, TargetLang } from "./messages";

export type TranslatorAvailability = "unavailable" | "downloadable" | "downloading" | "available";

export interface TranslatorPair {
  sourceLanguage: SourceLang;
  targetLanguage: TargetLang;
}

export interface DownloadProgress {
  loaded: number;
  total?: number;
}

interface DownloadProgressEvent extends Event {
  loaded: number;
  total?: number;
}

interface MonitorTarget {
  addEventListener(type: "downloadprogress", listener: (event: DownloadProgressEvent) => void): void;
}

export interface BuiltInTranslator {
  translate(text: string): Promise<string>;
  destroy?: () => void;
}

interface BuiltInTranslatorCreateOptions extends TranslatorPair {
  monitor?: (monitorTarget: MonitorTarget) => void;
}

interface BuiltInTranslatorConstructor {
  availability(options: TranslatorPair): Promise<TranslatorAvailability>;
  create(options: BuiltInTranslatorCreateOptions): Promise<BuiltInTranslator>;
}

function getTranslatorConstructor(): BuiltInTranslatorConstructor | undefined {
  const maybeTranslator = (globalThis as { Translator?: unknown }).Translator;
  if (
    typeof maybeTranslator === "function" &&
    "availability" in maybeTranslator &&
    "create" in maybeTranslator
  ) {
    return maybeTranslator as BuiltInTranslatorConstructor;
  }
  return undefined;
}

export function hasBuiltInTranslator(): boolean {
  return getTranslatorConstructor() !== undefined;
}

export async function translatorAvailability(pair: TranslatorPair): Promise<TranslatorAvailability> {
  const Translator = getTranslatorConstructor();
  if (!Translator) return "unavailable";
  return Translator.availability(pair);
}

export async function createTranslator(
  pair: TranslatorPair,
  onDownloadProgress?: (progress: DownloadProgress) => void,
): Promise<BuiltInTranslator> {
  const Translator = getTranslatorConstructor();
  if (!Translator) {
    throw new Error("Translator API unavailable");
  }

  return Translator.create({
    ...pair,
    monitor(monitorTarget) {
      monitorTarget.addEventListener("downloadprogress", (event) => {
        onDownloadProgress?.({ loaded: event.loaded, total: event.total });
      });
    },
  });
}

export function isUserActivationError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "NotAllowedError"
    : error instanceof Error && error.name === "NotAllowedError";
}
