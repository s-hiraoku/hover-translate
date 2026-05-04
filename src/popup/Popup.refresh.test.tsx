import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  STORAGE_KEY,
  defaultState,
  messageForCode,
} from "../shared/messages";
import type {
  GetUsageResponse,
  StorageState,
  TestKeyResponse,
} from "../shared/messages";
import { installChromeMock } from "../test/chrome-mock";

type RuntimeMessage =
  | { type: "GET_USAGE" }
  | { type: "TEST_KEY"; key: string }
  | { type: string; key?: string };

const requiredState: StorageState = {
  ...defaultState,
  deeplApiKey: "saved-key",
};

const usageOne = {
  character_count: 250,
  character_limit: 1_000,
};

const usageTwo = {
  character_count: 300,
  character_limit: 1_000,
};

function stubCommands() {
  (
    globalThis.chrome as unknown as {
      commands: { getAll: ReturnType<typeof vi.fn> };
      tabs: { create: ReturnType<typeof vi.fn> };
    }
  ).commands = {
    getAll: vi.fn().mockResolvedValue([]),
  };
  (
    globalThis.chrome as unknown as {
      tabs: { create: ReturnType<typeof vi.fn> };
    }
  ).tabs.create = vi.fn();
}

function stubSendMessage(
  handler: (message: RuntimeMessage) => Promise<GetUsageResponse | TestKeyResponse | undefined>,
) {
  return vi.spyOn(chrome.runtime, "sendMessage").mockImplementation(async (message: unknown) => {
    return handler(message as RuntimeMessage);
  });
}

async function renderPopup(
  initialState: Partial<StorageState>,
  sendMessageHandler: (
    message: RuntimeMessage,
  ) => Promise<GetUsageResponse | TestKeyResponse | undefined>,
) {
  installChromeMock();
  await chrome.storage.local.set({
    [STORAGE_KEY]: { ...defaultState, ...initialState },
  });
  stubCommands();
  const sendMessage = stubSendMessage(sendMessageHandler);

  vi.resetModules();
  const { Popup } = await import("./Popup");
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

function apiKeyInput() {
  return screen.getByPlaceholderText("Paste your key here") as HTMLInputElement;
}

function getUsageCalls(sendMessage: ReturnType<typeof vi.fn>) {
  return sendMessage.mock.calls.filter(([message]) => {
    return (message as RuntimeMessage).type === "GET_USAGE";
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Popup forced usage refresh", () => {
  it("lets the Refresh button bypass the module cache", async () => {
    const { sendMessage, user } = await renderPopup(requiredState, async () => ({
      ok: true,
      usage: usageOne,
    }));

    await screen.findByText("250 / 1,000");
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(getUsageCalls(sendMessage)).toHaveLength(2));
    expect(getUsageCalls(sendMessage).map(([message]) => message)).toEqual([
      { type: "GET_USAGE" },
      { type: "GET_USAGE" },
    ]);
  });

  it("uses cached usage for automatic refreshes inside the TTL", async () => {
    let now = 1_778_192_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    installChromeMock();
    await chrome.storage.local.set({ [STORAGE_KEY]: requiredState });
    stubCommands();
    const sendMessage = stubSendMessage(async () => ({ ok: true, usage: usageOne }));

    vi.resetModules();
    const { Popup } = await import("./Popup");
    const first = render(<Popup />);
    await screen.findByText("250 / 1,000");
    expect(getUsageCalls(sendMessage)).toHaveLength(1);

    first.unmount();
    now += 15_000;
    render(<Popup />);

    await screen.findByText("250 / 1,000");
    expect(getUsageCalls(sendMessage)).toHaveLength(1);
  });
});

describe("Popup usage rejection paths", () => {
  it("clears usage and renders the mapped error when GET_USAGE returns ok false", async () => {
    await renderPopup(requiredState, async () => ({
      ok: false,
      errorCode: "QUOTA_EXCEEDED",
    }));

    await screen.findByText(messageForCode("QUOTA_EXCEEDED"));
    expect(screen.queryByText("250 / 1,000")).toBeNull();
  });

  it("clears usage and renders UNKNOWN when GET_USAGE rejects", async () => {
    await renderPopup(requiredState, async (message) => {
      if (message.type === "GET_USAGE") throw new Error("network down");
      return undefined;
    });

    await screen.findByText(messageForCode("UNKNOWN"));
    expect(screen.queryByText("250 / 1,000")).toBeNull();
  });

  it("clears stale cached usage and requests fresh usage after saving a new key", async () => {
    let usageIndex = 0;
    const { sendMessage, user } = await renderPopup(requiredState, async (message) => {
      if (message.type === "GET_USAGE") {
        usageIndex += 1;
        return { ok: true, usage: usageIndex === 1 ? usageOne : usageTwo };
      }
      return undefined;
    });

    await screen.findByText("250 / 1,000");
    await user.clear(apiKeyInput());
    await user.type(apiKeyInput(), "new-key");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("300 / 1,000");
    expect(getUsageCalls(sendMessage)).toHaveLength(2);
  });
});
