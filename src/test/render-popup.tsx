import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, vi } from "vitest";
import type {
  GetUsageResponse,
  StorageState,
  TestKeyResponse,
} from "../shared/messages";
import { STORAGE_KEY, defaultState } from "../shared/messages";
import type { ChromeMock } from "./chrome-mock";
import { installChromeMock } from "./chrome-mock";

type RuntimeMessage =
  | { type: "GET_USAGE" }
  | { type: "TEST_KEY"; key: string }
  | { type: string; key?: string };

export interface RenderPopupOptions {
  commands?: chrome.commands.Command[];
  sendMessage?: (message: unknown) => Promise<unknown>;
  usageResponse?: GetUsageResponse;
  testResponse?: TestKeyResponse;
  throwOnTest?: Error;
}

export function stubCommands(commands: chrome.commands.Command[] = []) {
  (chrome as unknown as ChromeMock).commands._setAll(commands);
}

export function stubSendMessage(options: RenderPopupOptions = {}) {
  const sendMessage = vi
    .spyOn(chrome.runtime, "sendMessage")
    .mockImplementation(async (message: unknown) => {
      if (options.sendMessage) return options.sendMessage(message);

      const typed = message as RuntimeMessage;
      if (typed.type === "GET_USAGE") {
        return options.usageResponse ?? { ok: false, errorCode: "MISSING_KEY" };
      }
      if (typed.type === "TEST_KEY") {
        if (options.throwOnTest) throw options.throwOnTest;
        return options.testResponse ?? { ok: false, errorCode: "MISSING_KEY" };
      }
      return undefined;
    });
  return sendMessage;
}

export async function renderPopup(
  initialState?: Partial<StorageState>,
  options: RenderPopupOptions = {},
) {
  installChromeMock();
  if (initialState) {
    await chrome.storage.local.set({
      [STORAGE_KEY]: { ...defaultState, ...initialState },
    });
  }
  stubCommands(options.commands);
  const sendMessage = stubSendMessage(options);

  vi.resetModules();
  const { Popup } = await import("../popup/Popup");
  const view = render(<Popup />);
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );

  return {
    ...view,
    sendMessage,
    user: userEvent.setup(),
  };
}
