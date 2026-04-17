import type {
  DeepLTranslateResult,
  DeepLUsage,
  TranslateErrorCode,
} from "../shared/messages";

const BASE_URL = "https://api-free.deepl.com/v2";

export class DeepLError extends Error {
  code: TranslateErrorCode;
  status?: number;

  constructor(code: TranslateErrorCode, message: string, status?: number) {
    super(message);
    this.name = "DeepLError";
    this.code = code;
    this.status = status;
  }
}

function mapStatusToError(status: number): DeepLError {
  if (status === 403) {
    return new DeepLError("INVALID_KEY", "DeepL API key rejected", status);
  }

  if (status === 456) {
    return new DeepLError("QUOTA_EXCEEDED", "DeepL quota exceeded", status);
  }

  if (status === 429) {
    return new DeepLError("RATE_LIMITED", "DeepL rate limit exceeded", status);
  }

  if (status >= 500 && status < 600) {
    return new DeepLError("SERVER_ERROR", "DeepL server error", status);
  }

  return new DeepLError("UNKNOWN", `DeepL request failed: ${status}`, status);
}

async function parseJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new DeepLError(
      "UNKNOWN",
      error instanceof Error ? error.message : "Invalid JSON from DeepL",
      response.status,
    );
  }
}

async function ensureOk(response: Response): Promise<Response> {
  if (!response.ok) {
    throw mapStatusToError(response.status);
  }

  return response;
}

export async function translateText(args: {
  key: string;
  text: string;
  context?: string;
  sourceLang: "EN" | "JA";
  targetLang: "EN-US" | "EN-GB" | "JA";
}): Promise<string> {
  const params = new URLSearchParams();
  params.set("text", args.text);
  params.set("source_lang", args.sourceLang);
  params.set("target_lang", args.targetLang);
  params.set("preserve_formatting", "1");
  params.set("split_sentences", "nonewlines");
  if (args.context) {
    params.set("context", args.context);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/translate`, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${args.key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
  } catch (error) {
    throw new DeepLError(
      "NETWORK_ERROR",
      error instanceof Error ? error.message : String(error),
    );
  }

  const okResponse = await ensureOk(response);
  const result = await parseJson<DeepLTranslateResult>(okResponse);
  const translated = result.translations[0]?.text;

  if (typeof translated !== "string") {
    throw new DeepLError("UNKNOWN", "Unexpected DeepL translate response shape");
  }

  return translated;
}

export async function getUsage(key: string): Promise<DeepLUsage> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/usage`, {
      method: "GET",
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
      },
    });
  } catch (error) {
    throw new DeepLError(
      "NETWORK_ERROR",
      error instanceof Error ? error.message : String(error),
    );
  }

  const okResponse = await ensureOk(response);
  return parseJson<DeepLUsage>(okResponse);
}
