import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_MAX_CHARS,
  MIN_MAX_CHARS,
  STORAGE_KEY,
  defaultState,
  messageForCode,
} from "../shared/messages";
import type { StorageState } from "../shared/messages";
import { installChromeMock } from "../test/chrome-mock";
import { installTranslatorMock } from "../test/boot-content-script";
import { renderPopup, stubCommands } from "../test/render-popup";

function isDisabled(element: HTMLElement): boolean {
  return (element as HTMLButtonElement | HTMLInputElement).disabled;
}

function maxCharsInput() {
  return screen.getByLabelText("Max characters per request") as HTMLInputElement;
}

async function storedState() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] as StorageState;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Popup initial render and engine state", () => {
  it("renders without an API-key setup step", async () => {
    await renderPopup();

    expect(screen.getByText("Engine")).toBeTruthy();
    expect(screen.queryByText("API key required")).toBeNull();
    expect(screen.queryByPlaceholderText("Paste your key here")).toBeNull();
    expect(screen.getByText("Ready for English ⇄ Japanese")).toBeTruthy();
    expect(screen.getByText("Idle")).toBeTruthy();
    expect(isDisabled(screen.getByRole("button", { name: "Enable translation" }))).toBe(false);
  });

  it("shows an unsupported-browser message when Translator is missing", async () => {
    installChromeMock();
    stubCommands();
    vi.stubGlobal("Translator", undefined);

    vi.resetModules();
    const { Popup } = await import("./Popup");
    const { render } = await import("@testing-library/react");
    render(<Popup />);

    await screen.findByText("Chrome 138+ desktop required");
    expect(screen.getByText(messageForCode("TRANSLATOR_UNSUPPORTED"))).toBeTruthy();
    expect(isDisabled(screen.getByRole("button", { name: "Enable translation" }))).toBe(true);
  });

  it("prepares downloadable language packs from a user click", async () => {
    installChromeMock();
    const { create } = installTranslatorMock({ availability: "downloadable" });
    stubCommands();

    vi.resetModules();
    const { Popup } = await import("./Popup");
    const { render } = await import("@testing-library/react");
    const userEvent = await import("@testing-library/user-event");
    render(<Popup />);
    const user = userEvent.default.setup();

    await screen.findByText("Prepare language packs before first use");
    await user.click(screen.getByRole("button", { name: "Prepare" }));

    await screen.findByText("Ready for English ⇄ Japanese");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      sourceLanguage: "en",
      targetLanguage: "ja",
    }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      sourceLanguage: "ja",
      targetLanguage: "en",
    }));
  });
});

describe("Popup storage live sync", () => {
  it("updates enabled state from local storage changes after mount", async () => {
    await renderPopup({ enabled: false });

    await chrome.storage.local.set({
      [STORAGE_KEY]: { ...defaultState, enabled: true },
    });

    await screen.findByText("Active");
    expect(screen.getByRole("button", { name: "Disable translation" })).toBeTruthy();
  });

  it("normalizes invalid stored state from live changes", async () => {
    await renderPopup({ enabled: true, mode: "selection" });

    chrome.storage.onChanged._emit(
      {
        [STORAGE_KEY]: {
          oldValue: defaultState,
          newValue: { ...defaultState, enabled: true, mode: "bogus" },
        },
      },
      "local",
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Hover" }).className).toContain("active"),
    );
  });
});

describe("Popup toggle, mode, and trigger controls", () => {
  it("toggles enabled state through storage and updates the button class", async () => {
    const { user } = await renderPopup({ enabled: false });

    await user.click(screen.getByRole("button", { name: "Enable translation" }));

    await screen.findByText("Active");
    expect(screen.getByRole("button", { name: "Disable translation" }).className).toContain("on");
    expect((await storedState()).enabled).toBe(true);
  });

  it("writes hover and selection mode changes", async () => {
    const { user } = await renderPopup({ enabled: true, mode: "hover" });

    await user.click(screen.getByRole("button", { name: "Selection" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Selection" }).className).toContain("active"),
    );
    expect((await storedState()).mode).toBe("selection");

    await user.click(screen.getByRole("button", { name: "Hover" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Hover" }).className).toContain("active"),
    );
    expect((await storedState()).mode).toBe("hover");
  });

  it("writes shortcut and auto trigger changes", async () => {
    const { user } = await renderPopup({
      enabled: true,
      mode: "selection",
      selectionTrigger: "shortcut",
    });

    await user.click(screen.getByRole("button", { name: "Auto" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Auto" }).className).toContain("active"),
    );
    expect((await storedState()).selectionTrigger).toBe("auto");
  });
});

describe("Popup max characters input", () => {
  it("writes a valid number to storage", async () => {
    await renderPopup();

    fireEvent.change(maxCharsInput(), { target: { value: "2200" } });

    await waitFor(async () => expect((await storedState()).maxChars).toBe(2200));
  });

  it("clamps empty-string input from a number input to MIN_MAX_CHARS", async () => {
    await renderPopup();

    fireEvent.change(maxCharsInput(), { target: { value: "" } });

    await waitFor(async () => expect((await storedState()).maxChars).toBe(MIN_MAX_CHARS));
  });

  it("clamps out-of-range numbers before writing to storage", async () => {
    await renderPopup();

    fireEvent.change(maxCharsInput(), { target: { value: "99999" } });

    await waitFor(async () => expect((await storedState()).maxChars).toBe(MAX_MAX_CHARS));
  });
});

describe("Popup shortcut display", () => {
  it("shows the configured translate-selection shortcut", async () => {
    await renderPopup(
      {
        enabled: true,
        mode: "selection",
        selectionTrigger: "shortcut",
      },
      {
        commands: [
          { name: "other-command", shortcut: "Ctrl+X" },
          { name: "translate-selection", shortcut: "Alt+Shift+T" },
        ],
      },
    );

    const shortcutRow = document.querySelector(".shortcut");
    expect(shortcutRow).not.toBeNull();
    expect(within(shortcutRow as HTMLElement).getByText("Alt+Shift+T")).toBeTruthy();
  });
});
