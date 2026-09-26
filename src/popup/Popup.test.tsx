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

function translateField() {
  return screen.getByRole("textbox", { name: "Text" });
}

function translateButton() {
  return screen.getByRole("button", { name: "Translate" });
}

describe("Popup translate field", () => {
  it("places the text field, translate button, and result above power, mode, and limits", async () => {
    const { user } = await renderPopup({ enabled: true, mode: "hover" });
    const field = translateField() as HTMLTextAreaElement;
    const button = translateButton();
    const power = screen.getByRole("button", { name: "Disable translation" });
    const mode = screen.getByRole("button", { name: "Hover" });
    const limits = maxCharsInput();

    expect(field.rows).toBe(7);
    expect(field.compareDocumentPosition(power) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.compareDocumentPosition(power) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(field.compareDocumentPosition(mode) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(field.compareDocumentPosition(limits) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Engine" }).compareDocumentPosition(field) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();

    await user.type(field, "hello");
    await user.click(button);
    const result = await screen.findByText("translated");
    expect(result.compareDocumentPosition(power) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(result.compareDocumentPosition(limits) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("translates an English draft and shows EN → JA", async () => {
    const { user, translator } = await renderPopup();

    await user.type(translateField(), "hello");
    await user.click(translateButton());

    expect(await screen.findByText("translated")).toBeTruthy();
    expect(screen.getByText("EN \u2192 JA")).toBeTruthy();
    expect(translator.create).toHaveBeenCalledTimes(1);
    expect(translator.create).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLanguage: "en", targetLanguage: "ja" }),
    );
    expect(translator.translate).toHaveBeenCalledWith("hello");
  });

  it("shows JA → EN for a Japanese draft", async () => {
    const { user, translator } = await renderPopup();

    await user.type(translateField(), "\u3053\u3093\u306b\u3061\u306f");
    await user.click(translateButton());

    expect(await screen.findByText("translated")).toBeTruthy();
    expect(screen.getByText("JA \u2192 EN")).toBeTruthy();
    expect(translator.translate).toHaveBeenCalledWith("\u3053\u3093\u306b\u3061\u306f");
    expect(translator.create).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLanguage: "ja", targetLanguage: "en" }),
    );
  });

  it("returns to idle when the next draft is only whitespace", async () => {
    const { user, translator } = await renderPopup();

    await user.type(translateField(), "hello");
    await user.click(translateButton());
    expect(await screen.findByText("translated")).toBeTruthy();
    expect(screen.getByText("EN \u2192 JA")).toBeTruthy();

    await user.clear(translateField());
    await user.type(translateField(), "   ");
    await user.click(translateButton());

    await waitFor(() => {
      expect(screen.queryByText("translated")).toBeNull();
      expect(screen.queryByText("EN \u2192 JA")).toBeNull();
    });
    expect(translator.translate).toHaveBeenCalledTimes(1);
  });

  it("shows the too-long message and does not translate", async () => {
    const limit = MIN_MAX_CHARS;
    const { user, translator } = await renderPopup({ maxChars: limit });
    await waitFor(() => expect(maxCharsInput().value).toBe(String(limit)));

    fireEvent.change(translateField(), { target: { value: "a".repeat(limit + 1) } });
    await user.click(translateButton());

    expect(await screen.findByText(messageForCode("TEXT_TOO_LONG", limit))).toBeTruthy();
    expect(translator.translate).not.toHaveBeenCalled();
    expect(translator.create).not.toHaveBeenCalled();
  });

  it("translates while the extension toggle is off", async () => {
    const { user } = await renderPopup({ enabled: false });

    await screen.findByText("Idle");
    expect(isDisabled(translateField())).toBe(false);
    expect(isDisabled(translateButton())).toBe(false);
    await user.type(translateField(), "hello");
    await user.click(translateButton());

    expect(await screen.findByText("translated")).toBeTruthy();
    expect(screen.getByText("EN \u2192 JA")).toBeTruthy();
  });

  it("disables the text field and translate button when Translator is missing", async () => {
    installChromeMock();
    stubCommands();
    vi.stubGlobal("Translator", undefined);

    vi.resetModules();
    const { Popup } = await import("./Popup");
    const { render } = await import("@testing-library/react");
    render(<Popup />);

    await screen.findByText("Chrome 138+ desktop required");
    expect(isDisabled(translateField())).toBe(true);
    expect(isDisabled(translateButton())).toBe(true);
  });

  it("keeps the latest result when an older translation resolves later", async () => {
    const releases: Array<(value: string) => void> = [];
    const { user, translator } = await renderPopup(undefined, {
      translator: {
        translate: () =>
          new Promise<string>((resolve) => {
            releases.push(resolve);
          }),
      },
    });

    await user.type(translateField(), "one");
    await user.click(translateButton());
    await waitFor(() => expect(translator.translate).toHaveBeenCalledTimes(1));

    await user.clear(translateField());
    await user.type(translateField(), "two");
    await user.click(translateButton());
    await waitFor(() => expect(translator.translate).toHaveBeenCalledTimes(2));
    expect(releases).toHaveLength(2);

    const releaseSecond = releases[1];
    const releaseFirst = releases[0];
    if (!releaseSecond || !releaseFirst) {
      throw new Error("expected both translations to stay pending");
    }

    releaseSecond("second result");
    expect(await screen.findByText("second result")).toBeTruthy();
    expect(screen.queryByText("first result")).toBeNull();
    expect(screen.getByText("EN \u2192 JA")).toBeTruthy();

    releaseFirst("first result");
    await waitFor(() => {
      expect(screen.queryByText("first result")).toBeNull();
      expect(screen.getByText("second result")).toBeTruthy();
    });
  });

  it("leaves storage limited to the existing settings after a translation", async () => {
    const { user } = await renderPopup({ ...defaultState });

    await user.type(translateField(), "hello");
    await user.click(translateButton());
    expect(await screen.findByText("translated")).toBeTruthy();

    expect(await storedState()).toEqual(defaultState);
  });

  it("creates the English translator once and reuses it", async () => {
    const { user, translator } = await renderPopup();

    await user.type(translateField(), "hello");
    await user.click(translateButton());
    expect(await screen.findByText("translated")).toBeTruthy();
    expect(screen.getByText("EN \u2192 JA")).toBeTruthy();

    await user.clear(translateField());
    await user.type(translateField(), "hello again");
    await user.click(translateButton());
    await waitFor(() => expect(translator.translate).toHaveBeenCalledTimes(2));

    expect(screen.getByText("translated")).toBeTruthy();
    expect(screen.getByText("EN \u2192 JA")).toBeTruthy();
    expect(translator.create).toHaveBeenCalledTimes(1);
    expect(translator.create).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLanguage: "en", targetLanguage: "ja" }),
    );
    expect(translator.translate).toHaveBeenNthCalledWith(1, "hello");
    expect(translator.translate).toHaveBeenNthCalledWith(2, "hello again");
    expect(translator.translator.destroy).not.toHaveBeenCalled();
  });

  it("shows the download-required message and does not translate", async () => {
    const { user, translator } = await renderPopup(undefined, {
      translator: { availability: "downloadable" },
    });

    await user.type(translateField(), "hello");
    await user.click(translateButton());

    expect(await screen.findByText(messageForCode("LANGUAGE_PACK_DOWNLOAD_REQUIRED"))).toBeTruthy();
    expect(translator.translate).not.toHaveBeenCalled();
    expect(translator.create).not.toHaveBeenCalled();
  });
});
