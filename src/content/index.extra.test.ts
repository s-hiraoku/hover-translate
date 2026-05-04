import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installChromeMock } from "../test/chrome-mock";
import {
  STORAGE_KEY,
  defaultState,
  messageForCode,
} from "../shared/messages";
import type {
  StorageState,
  TranslateResponse,
} from "../shared/messages";

const HOVER_DELAY_MS = 300;
const COPIED_STATE_DURATION_MS = 1200;
const TOOLTIP_SELECTOR = '[data-hover-translate-tooltip="true"]';

const enabledHoverState: StorageState = {
  ...defaultState,
  enabled: true,
  mode: "hover",
  selectionTrigger: "shortcut",
  deeplApiKey: "k",
};

function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

async function flushAsyncWork(): Promise<void> {
  await flushMicrotasks();
  await flushMicrotasks();
}

function tooltip(): HTMLDivElement {
  const element = document.querySelector<HTMLDivElement>(TOOLTIP_SELECTOR);
  expect(element).not.toBeNull();
  return element as HTMLDivElement;
}

function copyButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Copy translation"], button[aria-label="Copied"]',
  );
  expect(button).not.toBeNull();
  return button as HTMLButtonElement;
}

function mouseover(target: Element, clientX = 24, clientY = 32): void {
  target.dispatchEvent(
    new MouseEvent("mouseover", {
      bubbles: true,
      clientX,
      clientY,
    }),
  );
}

function mouseout(target: Element, relatedTarget: EventTarget | null): void {
  target.dispatchEvent(
    new MouseEvent("mouseout", {
      bubbles: true,
      relatedTarget,
    }),
  );
}

async function finishDebouncedWork(): Promise<void> {
  vi.advanceTimersByTime(HOVER_DELAY_MS);
  await flushAsyncWork();
}

function stubSendMessage(
  response: TranslateResponse | Promise<TranslateResponse>,
) {
  const sendMessage = vi.fn(async () => response);
  (chrome.runtime as unknown as { sendMessage: typeof sendMessage }).sendMessage =
    sendMessage;
  return sendMessage;
}

async function bootContentScript(
  state: Partial<StorageState> = {},
  response: TranslateResponse = { ok: true, translated: "translated" },
) {
  installChromeMock();
  const fullState: StorageState = {
    ...enabledHoverState,
    ...state,
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: fullState });
  const sendMessage = stubSendMessage(response);

  vi.resetModules();
  await import("./index");
  await flushAsyncWork();

  return { sendMessage, state: fullState };
}

function appendTextBlock<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  text: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  element.textContent = text;
  document.body.appendChild(element);
  return element;
}

function appendParagraph(text: string): HTMLParagraphElement {
  return appendTextBlock("p", text);
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
  for (const element of document.querySelectorAll(TOOLTIP_SELECTOR)) {
    element.remove();
  }
  vi.stubGlobal("innerWidth", 1024);
  vi.stubGlobal("innerHeight", 768);
});

afterEach(async () => {
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set({
      [STORAGE_KEY]: { ...defaultState, enabled: false },
    });
  }
  window.getSelection()?.removeAllRanges();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("extra content tooltip lifecycle coverage", () => {
  it("renders a visible tooltip with the tooltip marker after a successful hover translation", async () => {
    await bootContentScript();
    const paragraph = appendParagraph("Hello visible tooltip.");

    mouseover(paragraph);
    await finishDebouncedWork();

    const element = tooltip();
    expect(element.getAttribute("data-hover-translate-tooltip")).toBe("true");
    expect(element.style.display).not.toBe("none");
    expect(element.textContent).toContain("translated");
  });

  it("keeps the tooltip visible when mouseout moves into the tooltip", async () => {
    await bootContentScript();
    const paragraph = appendParagraph("Hello tooltip escape.");

    mouseover(paragraph);
    await finishDebouncedWork();
    mouseout(paragraph, copyButton());

    expect(tooltip().style.display).toBe("block");
  });

  it("keeps the tooltip visible when mouseout remains inside the active element", async () => {
    await bootContentScript();
    const paragraph = appendParagraph("Hello inside active.");
    const child = document.createElement("span");
    child.textContent = " child";
    paragraph.appendChild(child);

    mouseover(paragraph);
    await finishDebouncedWork();
    mouseout(paragraph, child);

    expect(tooltip().style.display).toBe("block");
  });

  it("sets numeric pixel coordinates after translation and hides on scroll", async () => {
    await bootContentScript();
    const paragraph = appendParagraph("Hello positioned tooltip.");
    vi.spyOn(paragraph, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 48, y: 64, width: 180, height: 24 }),
    );

    mouseover(paragraph);
    await finishDebouncedWork();

    expect(tooltip().style.left).toMatch(/^\d+px$/);
    expect(tooltip().style.top).toMatch(/^\d+px$/);

    window.dispatchEvent(new Event("scroll"));

    expect(tooltip().style.display).toBe("none");
  });

  it("hides the tooltip after mouseout to outside the active element", async () => {
    await bootContentScript();
    const paragraph = appendParagraph("Hello outside mouseout.");

    mouseover(paragraph);
    await finishDebouncedWork();
    mouseout(paragraph, null);

    expect(tooltip().style.display).toBe("none");
  });
});

describe("extra content copy button coverage", () => {
  it("copies translated text, shows the copied icon, then reverts", async () => {
    await bootContentScript({}, { ok: true, translated: "copy me" });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const paragraph = appendParagraph("Hello copy button.");

    mouseover(paragraph);
    await finishDebouncedWork();

    const button = copyButton();
    expect(button.style.display).toBe("flex");
    expect(button.getAttribute("aria-label")).toBe("Copy translation");

    button.click();
    await flushAsyncWork();

    expect(writeText).toHaveBeenCalledWith("copy me");
    expect(button.getAttribute("aria-label")).toBe("Copied");
    expect(button.innerHTML).toContain("polyline");

    vi.advanceTimersByTime(COPIED_STATE_DURATION_MS);

    expect(button.getAttribute("aria-label")).toBe("Copy translation");
    expect(button.innerHTML).not.toContain("polyline");
  });

  it("keeps the tooltip visible after clicking the copy button", async () => {
    await bootContentScript({}, { ok: true, translated: "still visible" });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const paragraph = appendParagraph("Hello click propagation.");

    mouseover(paragraph);
    await finishDebouncedWork();
    copyButton().click();
    await flushAsyncWork();

    expect(tooltip().style.display).toBe("block");
  });

  it("does not get stuck in copied state when clipboard write rejects and fallback fails", async () => {
    await bootContentScript({}, { ok: true, translated: "reject me" });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => false),
    });
    const paragraph = appendParagraph("Hello rejected copy.");

    mouseover(paragraph);
    await finishDebouncedWork();

    const button = copyButton();
    button.click();
    await flushAsyncWork();
    vi.advanceTimersByTime(COPIED_STATE_DURATION_MS);

    expect(button.getAttribute("aria-label")).toBe("Copy translation");
    expect(button.innerHTML).not.toContain("polyline");
    expect(tooltip().style.display).toBe("block");
  });
});

describe("extra content error rendering coverage", () => {
  it.each([
    "INVALID_KEY",
    "RATE_LIMITED",
    "QUOTA_EXCEEDED",
    "NETWORK_ERROR",
  ] as const)("renders %s as an error tooltip", async (errorCode) => {
    await bootContentScript({}, { ok: false, errorCode });
    const paragraph = appendParagraph(`Hello ${errorCode}.`);

    mouseover(paragraph);
    await finishDebouncedWork();

    expect(tooltip().textContent).toContain(messageForCode(errorCode));
    expect(tooltip().dataset.state).toBe("error");
  });

  it("renders the background-unavailable message when sendMessage rejects", async () => {
    await bootContentScript();
    const sendMessage = vi.fn(async () => {
      throw new Error("background unavailable");
    });
    (chrome.runtime as unknown as { sendMessage: typeof sendMessage }).sendMessage =
      sendMessage;
    const paragraph = appendParagraph("Hello rejection path.");

    mouseover(paragraph);
    await finishDebouncedWork();

    expect(tooltip().textContent).toContain(
      "Extension background is unavailable. Reload the page.",
    );
    expect(tooltip().dataset.state).toBe("error");
  });
});

describe("extra content re-translation and stale response coverage", () => {
  it("does not let an older response overwrite a newer active block", async () => {
    let resolveFirst: ((response: TranslateResponse) => void) | undefined;
    const firstResponse = new Promise<TranslateResponse>((resolve) => {
      resolveFirst = resolve;
    });
    const sendMessage = vi
      .fn()
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce({ ok: true, translated: "second translation" });
    await bootContentScript();
    (chrome.runtime as unknown as { sendMessage: typeof sendMessage }).sendMessage =
      sendMessage;
    const first = appendParagraph("First pending text.");
    const second = appendParagraph("Second fast text.");

    mouseover(first);
    await finishDebouncedWork();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(tooltip().textContent).toContain("…");

    mouseover(second);
    await finishDebouncedWork();
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(tooltip().textContent).toContain("second translation");

    expect(resolveFirst).toBeDefined();
    resolveFirst?.({ ok: true, translated: "stale first translation" });
    await flushAsyncWork();

    expect(tooltip().textContent).toContain("second translation");
    expect(tooltip().textContent).not.toContain("stale first translation");
  });

  it.skip("does not re-send after leaving and re-hovering the same block because WeakMap memoization is not implemented in src/content/index.ts");
});

describe("extra content shortcut selection coverage", () => {
  function stubSelection(text: string, options: { collapsed?: boolean } = {}) {
    const paragraph = appendParagraph("Before selected text after.");
    const textNode = paragraph.firstChild;
    expect(textNode).not.toBeNull();
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    Object.defineProperty(range, "getBoundingClientRect", {
      value: vi.fn(() => DOMRect.fromRect({ x: 10, y: 12, width: 80, height: 16 })),
    });
    const selection = {
      anchorNode: textNode,
      focusNode: textNode,
      isCollapsed: options.collapsed ?? false,
      rangeCount: options.collapsed ? 0 : 1,
      getRangeAt: vi.fn(() => range),
      removeAllRanges: vi.fn(),
      toString: vi.fn(() => text),
    } satisfies Partial<Selection>;
    vi.spyOn(window, "getSelection").mockReturnValue(selection as Selection);
  }

  it("translates the current selection when the shortcut message is received", async () => {
    const { sendMessage } = await bootContentScript({
      mode: "selection",
      selectionTrigger: "shortcut",
    });
    stubSelection("Selected   shortcut text");

    await (
      chrome.runtime.onMessage as unknown as {
        _emit: (message: unknown) => Promise<unknown>;
      }
    )._emit({ type: "TRANSLATE_SELECTION" });
    await flushAsyncWork();

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "TRANSLATE",
        text: "Selected shortcut text",
        source: "en",
        target: "ja",
      }),
    );
  });

  it("does not translate an empty shortcut selection", async () => {
    const { sendMessage } = await bootContentScript({
      mode: "selection",
      selectionTrigger: "shortcut",
    });
    stubSelection("", { collapsed: true });

    await (
      chrome.runtime.onMessage as unknown as {
        _emit: (message: unknown) => Promise<unknown>;
      }
    )._emit({ type: "TRANSLATE_SELECTION" });
    await flushAsyncWork();

    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("extra content context coverage", () => {
  it("includes truncated previous and next sibling text in the translation context", async () => {
    const { sendMessage } = await bootContentScript();
    const previous = appendParagraph(`${"a".repeat(520)} previous tail`);
    const current = appendParagraph("Middle text.");
    const next = appendParagraph(`next head ${"c".repeat(520)}`);

    mouseover(current);
    await finishDebouncedWork();

    const request = sendMessage.mock.calls[0]?.[0] as { context?: string };
    expect(request.context).toBeDefined();
    expect(request.context).toContain(previous.textContent?.slice(-500));
    expect(request.context).toContain(next.textContent?.slice(0, 500));
    expect(request.context).not.toContain("a".repeat(520));
    expect(request.context).not.toContain("c".repeat(520));
  });

  it("omits context for an isolated block", async () => {
    const { sendMessage } = await bootContentScript();
    const paragraph = appendParagraph("Only block text.");

    mouseover(paragraph);
    await finishDebouncedWork();

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ context: undefined }),
    );
  });
});

describe("extra content block selector coverage", () => {
  it.each([
    ["blockquote", "Quoted block text."],
    ["li", "List item text."],
    ["h2", "Heading text."],
  ] as const)("translates hovered <%s> blocks", async (tagName, text) => {
    const { sendMessage } = await bootContentScript();
    const block = appendTextBlock(tagName, text);

    mouseover(block);
    await finishDebouncedWork();

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text }),
    );
  });

  it('treats [role="paragraph"] as a text block', async () => {
    const { sendMessage } = await bootContentScript();
    const block = document.createElement("div");
    block.setAttribute("role", "paragraph");
    block.textContent = "Role paragraph text.";
    document.body.appendChild(block);

    mouseover(block);
    await finishDebouncedWork();

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Role paragraph text." }),
    );
  });
});

describe("extra content live storage update coverage", () => {
  it("stops hover translation after mode changes to selection", async () => {
    const { sendMessage, state } = await bootContentScript({ mode: "hover" });
    await chrome.storage.local.set({
      [STORAGE_KEY]: { ...state, mode: "selection" },
    });
    await flushAsyncWork();
    const paragraph = appendParagraph("Hello after mode switch.");

    mouseover(paragraph);
    await finishDebouncedWork();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("stops hover translation after enabled changes to false", async () => {
    const { sendMessage, state } = await bootContentScript({ enabled: true });
    await chrome.storage.local.set({
      [STORAGE_KEY]: { ...state, enabled: false },
    });
    await flushAsyncWork();
    const paragraph = appendParagraph("Hello after disable.");

    mouseover(paragraph);
    await finishDebouncedWork();

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
