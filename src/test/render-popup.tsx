import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, vi } from "vitest";
import type { StorageState } from "../shared/messages";
import { STORAGE_KEY, defaultState } from "../shared/messages";
import type { ChromeMock } from "./chrome-mock";
import { installChromeMock } from "./chrome-mock";
import { installTranslatorMock, type TranslatorMockOptions } from "./boot-content-script";

export interface RenderPopupOptions {
  commands?: chrome.commands.Command[];
  translator?: TranslatorMockOptions;
}

export function stubCommands(commands: chrome.commands.Command[] = []) {
  (chrome as unknown as ChromeMock).commands._setAll(commands);
}

export async function renderPopup(
  initialState?: Partial<StorageState>,
  options: RenderPopupOptions = {},
) {
  installChromeMock();
  installTranslatorMock(options.translator);
  if (initialState) {
    await chrome.storage.local.set({
      [STORAGE_KEY]: { ...defaultState, ...initialState },
    });
  }
  stubCommands(options.commands);

  vi.resetModules();
  const { Popup } = await import("../popup/Popup");
  const view = render(<Popup />);
  await waitFor(() => expect(screen.getByText("Engine")).toBeTruthy());

  return {
    ...view,
    user: userEvent.setup(),
  };
}
