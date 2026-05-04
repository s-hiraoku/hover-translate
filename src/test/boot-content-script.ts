import { expect, vi } from "vitest";
import type { StorageState, TranslateResponse } from "../shared/messages";
import { STORAGE_KEY, defaultState } from "../shared/messages";
import { installChromeMock } from "./chrome-mock";

const HOVER_DELAY_MS = 300;

export const TOOLTIP_SELECTOR = '[data-hover-translate-tooltip="true"]';

const enabledHoverState: StorageState = {
  ...defaultState,
  enabled: true,
  mode: "hover",
  selectionTrigger: "shortcut",
  deeplApiKey: "k",
};

export function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

export async function flushAsyncWork(): Promise<void> {
  await flushMicrotasks();
  await flushMicrotasks();
}

export function tooltip(): HTMLDivElement {
  const element = document.querySelector<HTMLDivElement>(TOOLTIP_SELECTOR);
  expect(element).not.toBeNull();
  return element as HTMLDivElement;
}

export function mouseover(target: Element, clientX = 24, clientY = 32): void {
  target.dispatchEvent(
    new MouseEvent("mouseover", {
      bubbles: true,
      clientX,
      clientY,
    }),
  );
}

export function mouseout(target: Element, relatedTarget: EventTarget | null): void {
  target.dispatchEvent(
    new MouseEvent("mouseout", {
      bubbles: true,
      relatedTarget,
    }),
  );
}

export async function finishDebouncedWork(): Promise<void> {
  vi.advanceTimersByTime(HOVER_DELAY_MS);
  await flushAsyncWork();
}

function stubSendMessage(response: TranslateResponse | Promise<TranslateResponse>) {
  const sendMessage = vi.fn(async () => response);
  (chrome.runtime as unknown as { sendMessage: typeof sendMessage }).sendMessage =
    sendMessage;
  return sendMessage;
}

export async function bootContentScript(
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
  await import("../content/index");
  await flushAsyncWork();

  return { sendMessage, state: fullState };
}
