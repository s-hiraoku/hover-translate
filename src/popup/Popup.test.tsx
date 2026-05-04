import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_MAX_CHARS,
  MIN_MAX_CHARS,
  STORAGE_KEY,
  defaultState,
  messageForCode,
} from "../shared/messages";
import { installChromeMock } from "../test/chrome-mock";
import type {
  GetUsageResponse,
  StorageState,
  TestKeyResponse,
} from "../shared/messages";

type RuntimeMessage =
  | { type: "GET_USAGE" }
  | { type: "TEST_KEY"; key: string }
  | { type: string; key?: string };

const okUsage = {
  character_count: 250,
  character_limit: 1_000,
};

const requiredState: StorageState = {
  ...defaultState,
  deeplApiKey: "saved-key",
};

function stubCommands(shortcut?: string) {
  (
    globalThis.chrome as unknown as {
      commands: { getAll: ReturnType<typeof vi.fn> };
      tabs: { create: ReturnType<typeof vi.fn> };
    }
  ).commands = {
    getAll: vi.fn().mockResolvedValue(
      shortcut
        ? [
            { name: "other-command", shortcut: "Ctrl+X" },
            { name: "translate-selection", shortcut },
          ]
        : [],
    ),
  };
  (
    globalThis.chrome as unknown as {
      tabs: { create: ReturnType<typeof vi.fn> };
    }
  ).tabs.create = vi.fn();
}

function stubSendMessage(options: {
  usageResponse?: GetUsageResponse;
  testResponse?: TestKeyResponse;
  throwOnTest?: Error;
} = {}) {
  const sendMessage = vi
    .spyOn(chrome.runtime, "sendMessage")
    .mockImplementation(async (message: unknown) => {
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

async function renderPopup(
  initialState?: Partial<StorageState>,
  options: {
    usageResponse?: GetUsageResponse;
    testResponse?: TestKeyResponse;
    throwOnTest?: Error;
    shortcut?: string;
  } = {},
) {
  installChromeMock();
  if (initialState) {
    await chrome.storage.local.set({
      [STORAGE_KEY]: { ...defaultState, ...initialState },
    });
  }
  stubCommands(options.shortcut);
  const sendMessage = stubSendMessage(options);

  vi.resetModules();
  const { Popup } = await import("./Popup");
  const view = render(<Popup />);
  await waitFor(() =>
    expect(isDisabled(screen.getByRole("button", { name: "Save" }))).toBe(false),
  );

  return {
    ...view,
    sendMessage,
    user: userEvent.setup(),
  };
}

function apiKeyInput() {
  return screen.getByPlaceholderText("Paste your key here") as HTMLInputElement;
}

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
  vi.restoreAllMocks();
});

describe("Popup initial render and loading", () => {
  it("renders default state when storage is empty", async () => {
    await renderPopup();

    expect(screen.getByText("API key required")).toBeTruthy();
    expect(screen.getByText("Idle")).toBeTruthy();
    expect(isDisabled(screen.getByRole("button", { name: "Save" }))).toBe(false);
    expect(isDisabled(screen.getByRole("button", { name: "Test" }))).toBe(true);
    expect(isDisabled(screen.getByRole("button", { name: "Enable translation" }))).toBe(true);
  });

  it("renders seeded state from storage", async () => {
    await renderPopup({
      enabled: true,
      mode: "selection",
      selectionTrigger: "auto",
      deeplApiKey: "abc123",
      maxChars: 2400,
    });

    expect(apiKeyInput().value).toBe("abc123");
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Selection" }).className).toContain("active");
    expect(screen.getByRole("button", { name: "Auto" }).className).toContain("active");
    expect(maxCharsInput().value).toBe("2400");
  });

  it("keeps controls disabled until the initial storage read resolves", async () => {
    installChromeMock();
    await chrome.storage.local.set({ [STORAGE_KEY]: requiredState });
    stubCommands();
    stubSendMessage();

    const originalGet = chrome.storage.local.get.bind(chrome.storage.local);
    let resolveGet: (() => void) | undefined;
    vi.spyOn(chrome.storage.local, "get").mockImplementation(async (keys) => {
      await new Promise<void>((resolve) => {
        resolveGet = resolve;
      });
      return originalGet(keys);
    });

    vi.resetModules();
    const { Popup } = await import("./Popup");
    render(<Popup />);

    expect(isDisabled(screen.getByRole("button", { name: "Save" }))).toBe(true);
    expect(isDisabled(screen.getByRole("button", { name: "Test" }))).toBe(true);
    expect(isDisabled(screen.getByRole("button", { name: "Enable translation" }))).toBe(true);

    resolveGet?.();
    await waitFor(() =>
      expect(isDisabled(screen.getByRole("button", { name: "Save" }))).toBe(false),
    );
    expect(isDisabled(screen.getByRole("button", { name: "Test" }))).toBe(false);
    expect(isDisabled(screen.getByRole("button", { name: "Enable translation" }))).toBe(false);
  });
});

describe("Popup storage live sync", () => {
  it("updates enabled state from local storage changes after mount", async () => {
    await renderPopup({ ...requiredState, enabled: false });

    await chrome.storage.local.set({
      [STORAGE_KEY]: { ...requiredState, enabled: true },
    });

    await screen.findByText("Active");
    expect(screen.getByRole("button", { name: "Disable translation" })).toBeTruthy();
  });

  it("ignores storage changes from non-local areas", async () => {
    await renderPopup({ ...requiredState, enabled: false });

    chrome.storage.onChanged._emit(
      { [STORAGE_KEY]: { oldValue: requiredState, newValue: { ...requiredState, enabled: true } } },
      "sync",
    );

    expect(screen.getByText("Idle")).toBeTruthy();
  });

  it("ignores storage changes for other keys", async () => {
    await renderPopup({ ...requiredState, enabled: false });

    chrome.storage.onChanged._emit(
      { otherKey: { oldValue: undefined, newValue: { ...requiredState, enabled: true } } },
      "local",
    );

    expect(screen.getByText("Idle")).toBeTruthy();
  });

  it("normalizes invalid stored state from live changes", async () => {
    await renderPopup({ ...requiredState, enabled: true, mode: "selection" });

    chrome.storage.onChanged._emit(
      {
        [STORAGE_KEY]: {
          oldValue: requiredState,
          newValue: { ...requiredState, enabled: true, mode: "bogus" },
        },
      },
      "local",
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Hover" }).className).toContain("active"),
    );
  });
});

describe("Popup API key save flow", () => {
  it("updates the API key input while typing", async () => {
    const { user } = await renderPopup();

    await user.type(apiKeyInput(), "  new-key  ");

    expect(apiKeyInput().value).toBe("  new-key  ");
  });

  it("saves a trimmed non-empty API key", async () => {
    const { user } = await renderPopup();

    await user.type(apiKeyInput(), "  new-key  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByText("API key required")).toBeNull());
    expect((await storedState()).deeplApiKey).toBe("new-key");
    expect(apiKeyInput().value).toBe("new-key");
  });

  it("clears the stored API key for whitespace-only input", async () => {
    const { user } = await renderPopup(requiredState);

    await user.clear(apiKeyInput());
    await user.type(apiKeyInput(), "   ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("API key required");
    expect((await storedState()).deeplApiKey).toBeUndefined();
  });

  it("disables Save while saving is in progress", async () => {
    const { user } = await renderPopup();
    let resolveSet: (() => void) | undefined;
    const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
    vi.spyOn(chrome.storage.local, "set").mockImplementation(async (items) => {
      await new Promise<void>((resolve) => {
        resolveSet = resolve;
      });
      return originalSet(items);
    });

    await user.type(apiKeyInput(), "new-key");
    const save = screen.getByRole("button", { name: "Save" });
    const click = user.click(save);

    await waitFor(() =>
      expect(isDisabled(screen.getByRole("button", { name: "Saving" }))).toBe(true),
    );
    resolveSet?.();
    await click;
    await waitFor(() =>
      expect(isDisabled(screen.getByRole("button", { name: "Save" }))).toBe(false),
    );
  });
});

describe("Popup connection testing", () => {
  it("keeps Test disabled for an empty or whitespace-only key and enables it for text", async () => {
    const { user } = await renderPopup();

    expect(isDisabled(screen.getByRole("button", { name: "Test" }))).toBe(true);
    await user.type(apiKeyInput(), "   ");
    expect(isDisabled(screen.getByRole("button", { name: "Test" }))).toBe(true);
    await user.type(apiKeyInput(), "key");
    expect(isDisabled(screen.getByRole("button", { name: "Test" }))).toBe(false);
  });

  it("sends the trimmed key and shows a success message", async () => {
    const { sendMessage, user } = await renderPopup(
      {},
      { testResponse: { ok: true, usage: okUsage } },
    );

    await user.type(apiKeyInput(), "  live-key  ");
    await user.click(screen.getByRole("button", { name: "Test" }));

    await screen.findByText("Connection verified.");
    expect(sendMessage).toHaveBeenCalledWith({ type: "TEST_KEY", key: "live-key" });
  });

  it("shows the mapped invalid-key message for failed tests", async () => {
    const { user } = await renderPopup(
      {},
      { testResponse: { ok: false, errorCode: "INVALID_KEY" } },
    );

    await user.type(apiKeyInput(), "bad-key");
    await user.click(screen.getByRole("button", { name: "Test" }));

    await screen.findByText(messageForCode("INVALID_KEY"));
  });

  it("maps rejected test requests to the unknown error message", async () => {
    const { user } = await renderPopup({}, { throwOnTest: new Error("network down") });

    await user.type(apiKeyInput(), "key");
    await user.click(screen.getByRole("button", { name: "Test" }));

    await screen.findByText(messageForCode("UNKNOWN"));
  });
});

describe("Popup usage refresh", () => {
  it("requests usage on mount when a saved key exists and renders the usage bar", async () => {
    const { sendMessage } = await renderPopup(requiredState, {
      usageResponse: { ok: true, usage: okUsage },
    });

    await screen.findByText("250 / 1,000");
    expect(screen.getByText("25%")).toBeTruthy();
    expect(sendMessage).toHaveBeenCalledWith({ type: "GET_USAGE" });
  });

  it("shows an error message and no usage numbers when usage loading fails", async () => {
    await renderPopup(requiredState, {
      usageResponse: { ok: false, errorCode: "QUOTA_EXCEEDED" },
    });

    await screen.findByText(messageForCode("QUOTA_EXCEEDED"));
    expect(screen.queryByText("250 / 1,000")).toBeNull();
  });

  it("clears usage and stops requesting usage after the saved key is removed", async () => {
    const { sendMessage, user } = await renderPopup(requiredState, {
      usageResponse: { ok: true, usage: okUsage },
    });
    await screen.findByText("250 / 1,000");

    sendMessage.mockClear();
    await user.clear(apiKeyInput());
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("API key required");
    expect(screen.queryByText("250 / 1,000")).toBeNull();
    expect(sendMessage).not.toHaveBeenCalledWith({ type: "GET_USAGE" });
  });

  it("uses module-scope cached usage for a second mount within the TTL", async () => {
    installChromeMock();
    await chrome.storage.local.set({ [STORAGE_KEY]: requiredState });
    stubCommands();
    const sendMessage = stubSendMessage({ usageResponse: { ok: true, usage: okUsage } });
    vi.resetModules();
    const { Popup } = await import("./Popup");

    const first = render(<Popup />);
    await screen.findByText("250 / 1,000");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    first.unmount();

    render(<Popup />);
    await screen.findByText("250 / 1,000");
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe("Popup toggle, mode, and trigger controls", () => {
  it("toggles enabled state through storage and updates the button class", async () => {
    const { user } = await renderPopup({ ...requiredState, enabled: false });

    await user.click(screen.getByRole("button", { name: "Enable translation" }));

    await screen.findByText("Active");
    expect(screen.getByRole("button", { name: "Disable translation" }).className).toContain("on");
    expect((await storedState()).enabled).toBe(true);
  });

  it("disables the toggle when no saved key exists", async () => {
    await renderPopup();

    expect(isDisabled(screen.getByRole("button", { name: "Enable translation" }))).toBe(true);
  });

  it("writes hover and selection mode changes", async () => {
    const { user } = await renderPopup({ ...requiredState, enabled: true, mode: "hover" });

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

  it("renders trigger segments only in selection mode", async () => {
    const { user } = await renderPopup({ ...requiredState, enabled: true, mode: "hover" });

    expect(screen.queryByRole("button", { name: "Shortcut" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Selection" }));

    await screen.findByRole("button", { name: "Shortcut" });
    expect(screen.getByRole("button", { name: "Auto" })).toBeTruthy();
  });

  it("writes shortcut and auto trigger changes", async () => {
    const { user } = await renderPopup({
      ...requiredState,
      enabled: true,
      mode: "selection",
      selectionTrigger: "shortcut",
    });

    await user.click(screen.getByRole("button", { name: "Auto" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Auto" }).className).toContain("active"),
    );
    expect((await storedState()).selectionTrigger).toBe("auto");

    await user.click(screen.getByRole("button", { name: "Shortcut" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Shortcut" }).className).toContain("active"),
    );
    expect((await storedState()).selectionTrigger).toBe("shortcut");
  });
});

describe("Popup max characters input", () => {
  // Use fireEvent.change for <input type="number"> — userEvent.type appends
  // character-by-character and combines with the existing value (e.g.
  // "1500" + "2200" → "15002200" → clamped to MAX_MAX_CHARS).
  it("writes a valid number to storage", async () => {
    await renderPopup();

    fireEvent.change(maxCharsInput(), { target: { value: "2200" } });

    await waitFor(async () => expect((await storedState()).maxChars).toBe(2200));
  });

  // <input type="number"> in jsdom normalizes non-numeric values to "",
  // and `Number("") === 0` is not NaN — so the implementation's
  // `Number.isNaN` guard does not fire, and clampMaxChars(0) returns
  // MIN_MAX_CHARS (500). This documents the actual behavior; the
  // "default to defaultState.maxChars" branch is unreachable through the
  // input element and only kicks in if `value` is literally non-numeric
  // (e.g. via a programmatic call with a string the browser can't parse).
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
        ...requiredState,
        enabled: true,
        mode: "selection",
        selectionTrigger: "shortcut",
      },
      { shortcut: "Alt+Shift+T" },
    );

    const shortcutRow = document.querySelector(".shortcut");
    expect(shortcutRow).not.toBeNull();
    expect(within(shortcutRow as HTMLElement).getByText("Alt+Shift+T")).toBeTruthy();
  });

  it("falls back to unset when no matching shortcut is configured", async () => {
    await renderPopup({
      ...requiredState,
      enabled: true,
      mode: "selection",
      selectionTrigger: "shortcut",
    });

    const shortcutRow = document.querySelector(".shortcut");
    expect(shortcutRow).not.toBeNull();
    expect(within(shortcutRow as HTMLElement).getByText("unset")).toBeTruthy();
  });
});
