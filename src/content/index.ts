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
const TOOLTIP_ATTR = "data-hover-translate-tooltip";
const LOADING_INDICATOR = "…";
const COPIED_STATE_DURATION_MS = 1200;
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
const COPY_ICON_SVG = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
`;
const CHECK_ICON_SVG = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
`;
type CopyButtonState = "idle" | "copied" | "hidden";
let tooltipContent: HTMLDivElement;
let copyButton: HTMLButtonElement;
let copyButtonState: CopyButtonState = "hidden";
let copiedStateTimeout: number | null = null;

const tooltip = createTooltip();

initialize();

function initialize(): void {
  document.addEventListener("mouseover", handleMouseOver);
  document.addEventListener("mouseout", handleMouseOut);
  document.addEventListener("mouseup", handleMouseUp);
  document.addEventListener("selectionchange", handleSelectionChange);
  window.addEventListener("scroll", hideTooltipOnScroll, {
    capture: true,
    passive: true,
  });
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
  if (relatedTarget instanceof Node) {
    if (activeElement.contains(relatedTarget)) {
      return;
    }
    if (
      relatedTarget instanceof Element &&
      relatedTarget.closest(`[${TOOLTIP_ATTR}="true"]`)
    ) {
      return;
    }
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
  context?: string,
): Promise<{ kind: "ok"; translated: string } | { kind: "error"; message: string }> {
  const [source, target] = detectLanguages(text);
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "TRANSLATE",
      text,
      context,
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

  showTooltip(LOADING_INDICATOR, element);
  const context = buildContext(element);
  const result = await requestTranslation(text, context);
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

  showTooltipAtRect(LOADING_INDICATOR, rect);
  const context = buildSelectionContext(selection);
  const result = await requestTranslation(text, context);
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

function buildContext(element: HTMLElement): string | undefined {
  const parts: string[] = [];
  const prev = element.previousElementSibling;
  if (prev instanceof HTMLElement) {
    const prevText = extractText(prev);
    if (prevText) parts.push(prevText.slice(-500));
  }

  const next = element.nextElementSibling;
  if (next instanceof HTMLElement) {
    const nextText = extractText(next);
    if (nextText) parts.push(nextText.slice(0, 500));
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

function buildSelectionContext(selection: Selection): string | undefined {
  if (selection.rangeCount === 0) return undefined;

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const element = container instanceof HTMLElement ? container : container.parentElement;
  if (!element) return undefined;

  const block = element.closest(BLOCK_SELECTOR);
  return block instanceof HTMLElement ? buildContext(block) : undefined;
}

function detectLanguages(text: string): [SourceLang, TargetLang] {
  return JAPANESE_TEXT_PATTERN.test(text) ? ["ja", "en"] : ["en", "ja"];
}

function createTooltip(): HTMLDivElement {
  const element = document.createElement("div");
  element.setAttribute(TOOLTIP_ATTR, "true");
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
    maxHeight: "60vh",
    overflowY: "auto",
    pointerEvents: "auto",
    whiteSpace: "pre-wrap",
    display: "none",
  } satisfies Partial<CSSStyleDeclaration>);

  tooltipContent = document.createElement("div");
  tooltipContent.setAttribute(TOOLTIP_ATTR, "true");
  Object.assign(tooltipContent.style, {
    paddingRight: "24px",
  } satisfies Partial<CSSStyleDeclaration>);

  copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.setAttribute(TOOLTIP_ATTR, "true");
  copyButton.setAttribute("aria-label", "Copy translation");
  copyButton.title = "Copy";
  copyButton.innerHTML = COPY_ICON_SVG;
  Object.assign(copyButton.style, {
    position: "absolute",
    top: "6px",
    right: "6px",
    width: "24px",
    height: "24px",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px",
    border: "0",
    borderRadius: "6px",
    background: "transparent",
    color: "#f9fafb",
    cursor: "pointer",
  } satisfies Partial<CSSStyleDeclaration>);
  copyButton.addEventListener("mouseenter", () => {
    copyButton.style.background = "rgba(255,255,255,0.12)";
  });
  copyButton.addEventListener("mouseleave", () => {
    copyButton.style.background = "transparent";
  });
  copyButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void copyTooltipText();
  });
  for (const eventName of [
    "mousedown",
    "mouseup",
    "mouseover",
    "mouseout",
    "pointerdown",
    "pointerup",
    "pointerover",
    "pointerout",
  ]) {
    copyButton.addEventListener(eventName, (event) => {
      event.stopPropagation();
    });
  }

  element.append(tooltipContent, copyButton);
  document.documentElement.appendChild(element);
  return element;
}

async function copyTooltipText(): Promise<void> {
  const text = tooltipContent.textContent ?? "";
  if (!text.trim() || text === LOADING_INDICATOR) {
    return;
  }

  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard API unavailable");
    }
    await navigator.clipboard.writeText(text);
  } catch {
    if (!copyTextWithExecCommand(text)) {
      return;
    }
  }

  setCopyButtonState("copied");
}

function copyTextWithExecCommand(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  Object.assign(textarea.style, {
    position: "fixed",
    top: "-9999px",
    left: "-9999px",
    opacity: "0",
  } satisfies Partial<CSSStyleDeclaration>);

  document.documentElement.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

function setCopyButtonState(next: CopyButtonState): void {
  if (copiedStateTimeout !== null) {
    window.clearTimeout(copiedStateTimeout);
    copiedStateTimeout = null;
  }

  if (copyButtonState === next) {
    return;
  }

  copyButtonState = next;

  if (next === "hidden") {
    copyButton.style.display = "none";
    return;
  }

  copyButton.style.display = "flex";
  if (next === "copied") {
    copyButton.innerHTML = CHECK_ICON_SVG;
    copyButton.title = "Copied";
    copiedStateTimeout = window.setTimeout(() => {
      copiedStateTimeout = null;
      setCopyButtonState("idle");
    }, COPIED_STATE_DURATION_MS);
  } else {
    copyButton.innerHTML = COPY_ICON_SVG;
    copyButton.title = "Copy";
  }
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
  tooltipContent.textContent = text;
  tooltip.dataset.state = options?.isError ? "error" : "ok";
  tooltip.style.borderLeft = options?.isError ? "4px solid #ef4444" : "4px solid transparent";
  const showCopy = !options?.isError && text !== LOADING_INDICATOR;
  setCopyButtonState(showCopy ? "idle" : "hidden");
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

function hideTooltipOnScroll(): void {
  if (tooltip.style.display === "block") {
    hideTooltip();
  }
}

function hideTooltip(): void {
  tooltip.style.display = "none";
  delete tooltip.dataset.state;
  tooltip.style.borderLeft = "4px solid transparent";
  setCopyButtonState("hidden");
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
  hideTooltip();
}
