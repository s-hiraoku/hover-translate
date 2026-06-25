import { expect, vi } from "vitest";
import type { StorageState } from "../shared/messages";
import { STORAGE_KEY, defaultState } from "../shared/messages";
import { installChromeMock } from "./chrome-mock";

const HOVER_DELAY_MS = 300;

export const TOOLTIP_SELECTOR = '[data-hover-translate-tooltip="true"]';

const enabledHoverState: StorageState = {
  ...defaultState,
  enabled: true,
  mode: "hover",
  selectionTrigger: "shortcut",
};

export function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

export async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await flushMicrotasks();
  }
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

export interface TranslatorMockOptions {
  availability?: "unavailable" | "downloadable" | "downloading" | "available";
  translate?: string | ((text: string) => string | Promise<string>);
  createError?: Error | DOMException;
}

export function installTranslatorMock(options: TranslatorMockOptions = {}) {
  const translate = vi.fn(async (text: string) =>
    typeof options.translate === "function"
      ? options.translate(text)
      : options.translate ?? "translated",
  );
  const translator = { translate, destroy: vi.fn() };
  const availability = vi.fn(async () => options.availability ?? "available");
  const create = vi.fn(async () => {
    if (options.createError) throw options.createError;
    return translator;
  });
  const Translator = function Translator() {
    return translator;
  };
  Object.assign(Translator, { availability, create });
  vi.stubGlobal("Translator", Translator);
  return { Translator, availability, create, translate, translator };
}

export async function bootContentScript(
  state: Partial<StorageState> = {},
  translatorOptions: TranslatorMockOptions = {},
) {
  installChromeMock();
  const translatorMock = installTranslatorMock(translatorOptions);
  const fullState: StorageState = {
    ...enabledHoverState,
    ...state,
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: fullState });

  vi.resetModules();
  await import("../content/index");
  await flushAsyncWork();

  return { ...translatorMock, state: fullState };
}
