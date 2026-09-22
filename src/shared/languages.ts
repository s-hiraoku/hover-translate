import type { SourceLang, TargetLang } from "./messages";

const JAPANESE_TEXT_PATTERN =
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

export function detectLanguages(text: string): [SourceLang, TargetLang] {
  return JAPANESE_TEXT_PATTERN.test(text) ? ["ja", "en"] : ["en", "ja"];
}
