import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "../manifest";
import { STORAGE_KEY, defaultState } from "../shared/messages";
import type { GetUsageResponse, StorageState, TestKeyResponse } from "../shared/messages";
import { installChromeMock } from "../test/chrome-mock";

type RuntimeMessage =
  | { type: "GET_USAGE" }
  | { type: "TEST_KEY"; key: string }
  | { type: string; key?: string };

const requiredShortcutState: StorageState = {
  ...defaultState,
  enabled: true,
  mode: "selection",
  selectionTrigger: "shortcut",
  deeplApiKey: "saved-key",
};

function stubCommands(shortcut = "Alt+Shift+T") {
  const getAll = vi.fn().mockResolvedValue([
    { name: "other-command", shortcut: "Ctrl+X" },
    { name: "translate-selection", shortcut },
  ]);
  const create = vi.fn();
  (
    globalThis.chrome as unknown as {
      commands: { getAll: typeof getAll };
      tabs: { create: typeof create };
    }
  ).commands = { getAll };
  (
    globalThis.chrome as unknown as {
      tabs: { create: typeof create };
    }
  ).tabs.create = create;
  return { create, getAll };
}

function stubSendMessage() {
  return vi.spyOn(chrome.runtime, "sendMessage").mockImplementation(async (message: unknown) => {
    const typed = message as RuntimeMessage;
    if (typed.type === "GET_USAGE") {
      return {
        ok: true,
        usage: { character_count: 10, character_limit: 100 },
      } satisfies GetUsageResponse;
    }
    return undefined satisfies TestKeyResponse | undefined;
  });
}

async function renderPopup(initialState: Partial<StorageState>) {
  installChromeMock();
  await chrome.storage.local.set({
    [STORAGE_KEY]: { ...defaultState, ...initialState },
  });
  const commandStubs = stubCommands();
  stubSendMessage();

  vi.resetModules();
  const { Popup } = await import("./Popup");
  render(<Popup />);
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );

  return {
    ...commandStubs,
    user: userEvent.setup(),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Popup shortcut settings link", () => {
  it("opens Chrome shortcut settings from the Change link in shortcut mode", async () => {
    const { create, user } = await renderPopup(requiredShortcutState);

    await screen.findByText("Alt+Shift+T");
    await user.click(screen.getByRole("link", { name: "Change" }));

    expect(create).toHaveBeenCalledWith({ url: "chrome://extensions/shortcuts" });
  });

  it("queries the same translate-selection command name declared in the manifest", async () => {
    const { getAll } = await renderPopup(requiredShortcutState);

    await screen.findByText("Alt+Shift+T");
    expect(getAll).toHaveBeenCalledTimes(1);
    expect(manifest.commands?.["translate-selection"]).toBeDefined();
  });
});
