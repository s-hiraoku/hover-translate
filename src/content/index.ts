import type {
  SourceLang,
  StorageState,
  TargetLang,
  ToggleToastRequest,
  TranslateRequest,
  TranslateResponse,
} from "../shared/messages";
import {
  STORAGE_KEY,
  defaultState,
  messageForCode,
  normalizeState,
  readStorageState,
} from "../shared/messages";

const HOVER_DELAY_MS = 300;
const JAPANESE_TEXT_PATTERN = /[\u3040-\u30ff\u4e00-\u9fff]/;
const BLOCK_SELECTOR = [
  "p",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "td",
  "th",
  "blockquote",
  "article",
  "section",
  "div",
  "main",
  "aside",
  "figcaption",
  "dd",
  "dt",
].join(",");

let isEnabled = false;
let maxCharsLimit = defaultState.maxChars;
let hoverTimer: number | null = null;
let activeElement: HTMLElement | null = null;
let activeAnchorRect: DOMRect | null = null;
const lastPointer = { x: 0, y: 0 };
let toast: HTMLDivElement | null = null;
let toastHideTimer: number | null = null;
let toastRemoveTimer: number | null = null;

const tooltip = createTooltip();

void initialize();

async function initialize(): Promise<void> {
  const state = await readStorageState();
  isEnabled = state.enabled;
  maxCharsLimit = state.maxChars;

  document.addEventListener("mouseover", handleMouseOver);
  document.addEventListener("mouseout", handleMouseOut);
  document.addEventListener(
    "mousemove",
    (event) => {
      lastPointer.x = event.clientX;
      lastPointer.y = event.clientY;
    },
    { passive: true },
  );

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !(STORAGE_KEY in changes)) {
      return;
    }

    const nextState = normalizeState(changes[STORAGE_KEY]?.newValue as StorageState | undefined);
    isEnabled = nextState.enabled;
    maxCharsLimit = nextState.maxChars;

    if (!isEnabled) {
      clearHoverTimer();
      clearActiveState();
    }
  });

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message !== "object" || message === null) {
      return;
    }

    const msg = message as Partial<ToggleToastRequest>;
    if (msg.type !== "TOGGLE_TOAST") {
      return;
    }

    showToast(msg.enabled ? "Hover Translate: ON" : "Hover Translate: OFF");
  });
}

function handleMouseOver(event: MouseEvent): void {
  if (!isEnabled) {
    return;
  }

  const block = findNearestTextBlock(event.target);
  if (!block) {
    return;
  }

  activeElement = block;
  activeAnchorRect = null;
  lastPointer.x = event.clientX;
  lastPointer.y = event.clientY;

  clearHoverTimer();
  hoverTimer = window.setTimeout(() => {
    activeAnchorRect = block.getBoundingClientRect();
    void translateAndShow(block);
  }, HOVER_DELAY_MS);
}

function handleMouseOut(event: MouseEvent): void {
  if (!activeElement) {
    return;
  }

  const relatedTarget = event.relatedTarget;
  if (relatedTarget instanceof Node && activeElement.contains(relatedTarget)) {
    return;
  }

  clearHoverTimer();
  clearActiveState();
}

async function translateAndShow(element: HTMLElement): Promise<void> {
  if (!isEnabled || activeElement !== element) {
    return;
  }

  const text = extractText(element);
  if (!text) {
    return;
  }

  if (text.length > maxCharsLimit) {
    showTooltip(messageForCode("TEXT_TOO_LONG", maxCharsLimit), element, { isError: true });
    return;
  }

  const [source, target] = detectLanguages(text);
  const request: TranslateRequest = {
    type: "TRANSLATE",
    text,
    source,
    target,
  };

  let response: TranslateResponse;
  try {
    response = (await chrome.runtime.sendMessage(request)) as TranslateResponse;
  } catch (error: unknown) {
    console.error("hover-translate sendMessage failed", error);
    if (activeElement === element) {
      showTooltip(messageForCode("NETWORK_ERROR"), element, { isError: true });
    }
    return;
  }

  if (activeElement !== element) {
    return;
  }

  if (!response.ok || !response.translated) {
    const message = response.errorCode
      ? messageForCode(response.errorCode, maxCharsLimit)
      : response.error ?? "Translation failed.";
    showTooltip(message, element, { isError: true });
    return;
  }

  showTooltip(response.translated, element);
}

function findNearestTextBlock(target: EventTarget | null): HTMLElement | null {
  const node = target instanceof Node ? target : null;
  if (!node) {
    return null;
  }

  let element: HTMLElement | null =
    node instanceof HTMLElement ? node : node.parentElement;

  while (element) {
    if (element.matches(BLOCK_SELECTOR)) {
      return element;
    }
    element = element.parentElement;
  }

  return null;
}

function extractText(element: HTMLElement): string {
  return element.innerText.replace(/\s+/g, " ").trim();
}

function detectLanguages(text: string): [SourceLang, TargetLang] {
  return JAPANESE_TEXT_PATTERN.test(text) ? ["ja", "en"] : ["en", "ja"];
}

function createTooltip(): HTMLDivElement {
  const element = document.createElement("div");
  element.setAttribute("data-hover-translate-tooltip", "true");
  Object.assign(element.style, {
    position: "fixed",
    zIndex: "2147483647",
    maxWidth: "420px",
    padding: "10px 12px",
    borderRadius: "10px",
    background: "rgba(17, 24, 39, 0.96)",
    color: "#f9fafb",
    fontSize: "13px",
    lineHeight: "1.5",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.28)",
    pointerEvents: "none",
    whiteSpace: "pre-wrap",
    display: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  document.documentElement.appendChild(element);
  return element;
}

function ensureToast(): HTMLDivElement {
  if (toast) {
    return toast;
  }

  const element = document.createElement("div");
  element.setAttribute("data-hover-translate-toast", "true");
  Object.assign(element.style, {
    position: "fixed",
    top: "16px",
    right: "16px",
    zIndex: "2147483647",
    padding: "10px 14px",
    borderRadius: "10px",
    background: "rgba(17, 24, 39, 0.92)",
    color: "#f9fafb",
    fontSize: "13px",
    fontWeight: "600",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.28)",
    pointerEvents: "none",
    opacity: "0",
    transform: "translateY(-8px)",
    transition: "opacity 200ms ease, transform 200ms ease",
    display: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  document.documentElement.appendChild(element);
  toast = element;
  return element;
}

function showTooltip(
  text: string,
  element: HTMLElement,
  options?: { isError?: boolean },
): void {
  tooltip.textContent = text;
  tooltip.dataset.state = options?.isError ? "error" : "ok";
  tooltip.style.borderLeft = options?.isError ? "4px solid #ef4444" : "4px solid transparent";
  tooltip.style.display = "block";

  const rect = activeElement === element && activeAnchorRect ? activeAnchorRect : element.getBoundingClientRect();
  const margin = 12;
  const maxLeft = Math.max(margin, window.innerWidth - tooltip.offsetWidth - margin);
  const preferredLeft = Math.min(rect.left, maxLeft);
  const fallbackLeft = Math.min(lastPointer.x + margin, maxLeft);
  const left = Math.max(margin, Number.isFinite(preferredLeft) ? preferredLeft : fallbackLeft);

  let top = rect.bottom + margin;
  if (top + tooltip.offsetHeight > window.innerHeight - margin) {
    top = rect.top - tooltip.offsetHeight - margin;
  }
  if (top < margin) {
    top = Math.min(window.innerHeight - tooltip.offsetHeight - margin, lastPointer.y + margin);
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(margin, top)}px`;
}

function showToast(text: string): void {
  const element = ensureToast();
  element.textContent = text;
  element.style.display = "block";

  requestAnimationFrame(() => {
    element.style.opacity = "1";
    element.style.transform = "translateY(0)";
  });

  if (toastHideTimer !== null) {
    window.clearTimeout(toastHideTimer);
    toastHideTimer = null;
  }
  if (toastRemoveTimer !== null) {
    window.clearTimeout(toastRemoveTimer);
    toastRemoveTimer = null;
  }

  toastHideTimer = window.setTimeout(() => {
    element.style.opacity = "0";
    element.style.transform = "translateY(-8px)";
    toastRemoveTimer = window.setTimeout(() => {
      element.style.display = "none";
      toastRemoveTimer = null;
    }, 300);
    toastHideTimer = null;
  }, 1200);
}

function clearHoverTimer(): void {
  if (hoverTimer !== null) {
    window.clearTimeout(hoverTimer);
    hoverTimer = null;
  }
}

function clearActiveState(): void {
  activeElement = null;
  activeAnchorRect = null;
  tooltip.style.display = "none";
  delete tooltip.dataset.state;
  tooltip.style.borderLeft = "4px solid transparent";
}
