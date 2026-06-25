import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "../manifest";
import { STORAGE_KEY, defaultState } from "../shared/messages";
import type { StorageState } from "../shared/messages";
import { installChromeMock } from "../test/chrome-mock";
import { installTranslatorMock } from "../test/boot-content-script";

const requiredShortcutState: StorageState = {
  ...defaultState,
  enabled: true,
  mode: "selection",
  selectionTrigger: "shortcut",
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

async function renderPopup(initialState: Partial<StorageState>) {
  installChromeMock();
  installTranslatorMock();
  await chrome.storage.local.set({
    [STORAGE_KEY]: { ...defaultState, ...initialState },
  });
  const commandStubs = stubCommands();

  vi.resetModules();
  const { Popup } = await import("./Popup");
  render(<Popup />);
  await waitFor(() => expect(screen.getByText("Ready for English ⇄ Japanese")).toBeTruthy());

  return {
    ...commandStubs,
    user: userEvent.setup(),
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
