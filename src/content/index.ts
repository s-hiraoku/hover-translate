import type {
  Mode,
  SelectionTrigger,
  SourceLang,
  StorageState,
  TargetLang,
  TranslateSelectionRequest,
  TranslateRequest,
  TranslateResponse,
} from "../shared/messages";
import {
  STORAGE_KEY,
  defaultState,
  messageForCode,
  normalizeState,
  readStorageState,
  resolveErrorMessage,
} from "../shared/messages";

const HOVER_DELAY_MS = 300;
const BACKGROUND_UNAVAILABLE_MSG = "Extension background is unavailable. Reload the page.";
const JAPANESE_TEXT_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const MIN_TEXT_LENGTH = 3;
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
  "figcaption",
  "dd",
  "dt",
  '[data-as="p"]',
  '[role="paragraph"]',
  '[data-testid="tweetText"]',
  ".notion-text-block",
].join(",");

let enabled = false;
let mode: Mode = "hover";
let selectionTrigger: SelectionTrigger = "shortcut";
let maxCharsLimit = defaultState.maxChars;
let hoverTimer: number | null = null;
let selectionTimer: number | null = null;
let activeElement: HTMLElement | null = null;
let currentGeneration = 0;
const lastPointer = { x: 0, y: 0 };

const tooltip = createTooltip();

initialize();

function initialize(): void {
  document.addEventListener("mouseover", handleMouseOver);
  document.addEventListener("mouseout", handleMouseOut);
  document.addEventListener("mouseup", handleMouseUp);
  document.addEventListener("selectionchange", handleSelectionChange);
  document.addEventListener(
    "mousemove",
    (event) => {
      lastPointer.x = event.clientX;
      lastPointer.y = event.clientY;
    },
    { passive: true },
  );

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if ((areaName !== "sync" && areaName !== "local") || !(STORAGE_KEY in changes)) {
      return;
    }

    const nextState = normalizeState(changes[STORAGE_KEY]?.newValue as StorageState | undefined);
    applyState(nextState);
  });

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message !== "object" || message === null) {
      return;
    }

    const msg = message as Partial<TranslateSelectionRequest>;
    if (msg.type !== "TRANSLATE_SELECTION") {
      return;
    }

    if (!enabled || mode !== "selection" || selectionTrigger !== "shortcut") {
      return;
    }

    void translateCurrentSelection();
  });

  void readStorageState().then(applyState);
}

function applyState(state: StorageState): void {
  const changed =
    enabled !== state.enabled ||
    mode !== state.mode ||
    selectionTrigger !== state.selectionTrigger;

  enabled = state.enabled;
  mode = state.mode;
  selectionTrigger = state.selectionTrigger;
  maxCharsLimit = state.maxChars;

  if (changed) {
    currentGeneration++;
    clearActiveState();
  }

  if (!enabled) {
    clearHoverTimer();
    clearSelectionTimer();
    return;
  }

  if (mode !== "hover") {
    clearHoverTimer();
    activeElement = null;
  }

  if (mode !== "selection" || selectionTrigger !== "auto") {
    clearSelectionTimer();
  }
}

function handleMouseOver(event: MouseEvent): void {
  if (!enabled || mode !== "hover") {
    return;
  }

  const block = findNearestTextBlock(event.target);
  if (!block) {
    return;
  }

  lastPointer.x = event.clientX;
  lastPointer.y = event.clientY;

  if (activeElement === block) {
    return;
  }

  activeElement = block;
  clearHoverTimer();
  hoverTimer = window.setTimeout(() => {
    if (!isCursorOverText(lastPointer.x, lastPointer.y)) {
      return;
    }
    void translateAndShow(block);
  }, HOVER_DELAY_MS);
}

interface CaretPosition {
  offsetNode: Node;
  offset: number;
}

function isCursorOverText(x: number, y: number): boolean {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => CaretPosition | null;
  };

  if (typeof doc.caretPositionFromPoint === "function") {
    const pos = doc.caretPositionFromPoint(x, y);
    return pos?.offsetNode?.nodeType === Node.TEXT_NODE;
  }

  if (typeof document.caretRangeFromPoint === "function") {
    const range = document.caretRangeFromPoint(x, y);
    return range?.startContainer?.nodeType === Node.TEXT_NODE;
  }

  return true;
}

function handleMouseOut(event: MouseEvent): void {
  if (mode !== "hover") {
    return;
  }

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

function handleMouseUp(): void {
  if (!enabled || mode !== "selection" || selectionTrigger !== "auto") {
    return;
  }

  clearSelectionTimer();
  selectionTimer = window.setTimeout(() => {
    void translateCurrentSelection();
  }, HOVER_DELAY_MS);
}

function handleSelectionChange(): void {
  if (mode !== "selection") {
    return;
  }

  if (!hasNonEmptySelection()) {
    clearSelectionTimer();
    clearActiveState();
  }
}

async function requestTranslation(
  text: string,
): Promise<{ kind: "ok"; translated: string } | { kind: "error"; message: string }> {
  const [source, target] = detectLanguages(text);
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "TRANSLATE",
      text,
      source,
      target,
    } satisfies TranslateRequest)) as TranslateResponse;

    if (response.ok && response.translated) {
      return { kind: "ok", translated: response.translated };
    }
    return { kind: "error", message: resolveErrorMessage(response, maxCharsLimit) };
  } catch {
    return { kind: "error", message: BACKGROUND_UNAVAILABLE_MSG };
  }
}

async function translateAndShow(element: HTMLElement): Promise<void> {
  if (!enabled || mode !== "hover" || activeElement !== element) return;

  const generation = currentGeneration;
  const text = extractText(element);
  if (!text) return;

  if (text.length > maxCharsLimit) {
    showTooltip(messageForCode("TEXT_TOO_LONG", maxCharsLimit), element, { isError: true });
    return;
  }

  const result = await requestTranslation(text);
  if (generation !== currentGeneration || activeElement !== element) return;

  if (result.kind === "error") {
    showTooltip(result.message, element, { isError: true });
    return;
  }
  showTooltip(result.translated, element);
}

async function translateCurrentSelection(): Promise<void> {
  if (!enabled || mode !== "selection") return;

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

  const text = selection.toString().replace(/\s+/g, " ").trim();
  if (!text) return;

  const rect = selection.getRangeAt(0).getBoundingClientRect();
  const generation = currentGeneration;

  if (text.length > maxCharsLimit) {
    showTooltipAtRect(messageForCode("TEXT_TOO_LONG", maxCharsLimit), rect, { isError: true });
    return;
  }

  const result = await requestTranslation(text);
  if (generation !== currentGeneration || !hasNonEmptySelection()) return;

  if (result.kind === "error") {
    showTooltipAtRect(result.message, rect, { isError: true });
    return;
  }
  showTooltipAtRect(result.translated, rect);
}

function findNearestTextBlock(target: EventTarget | null): HTMLElement | null {
  const node = target instanceof Node ? target : null;
  if (!node) {
    return null;
  }

  let element: HTMLElement | null =
    node instanceof HTMLElement ? node : node.parentElement;

  const budget = maxCharsLimit * 2;
  let fallback: HTMLElement | null = null;

  while (element) {
    if (element.matches(BLOCK_SELECTOR)) {
      return element;
    }

    const textLength = (element.textContent ?? "").length;
    if (textLength > budget) {
      return fallback;
    }

    if (!fallback && textLength >= MIN_TEXT_LENGTH && isBlockLevel(element)) {
      fallback = element;
    }

    element = element.parentElement;
  }

  return fallback;
}

function isBlockLevel(element: HTMLElement): boolean {
  const display = window.getComputedStyle(element).display;
  return (
    display === "block" ||
    display === "flex" ||
    display === "grid" ||
    display === "list-item" ||
    display === "flow-root" ||
    display === "inline-block"
  );
}

function extractText(element: HTMLElement): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
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

function showTooltip(
  text: string,
  element: HTMLElement,
  options?: { isError?: boolean },
): void {
  const rect = element.getBoundingClientRect();
  showTooltipAtRect(text, rect, options);
}

function showTooltipAtRect(
  text: string,
  rect: DOMRect,
  options?: { isError?: boolean },
): void {
  tooltip.textContent = text;
  tooltip.dataset.state = options?.isError ? "error" : "ok";
  tooltip.style.borderLeft = options?.isError ? "4px solid #ef4444" : "4px solid transparent";
  tooltip.style.display = "block";

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

function clearHoverTimer(): void {
  if (hoverTimer !== null) {
    window.clearTimeout(hoverTimer);
    hoverTimer = null;
  }
}

function clearSelectionTimer(): void {
  if (selectionTimer !== null) {
    window.clearTimeout(selectionTimer);
    selectionTimer = null;
  }
}

function hasNonEmptySelection(): boolean {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

function clearActiveState(): void {
  activeElement = null;
  tooltip.style.display = "none";
  delete tooltip.dataset.state;
  tooltip.style.borderLeft = "4px solid transparent";
}
