import { useEffect, useState } from "react";
import {
  MAX_MAX_CHARS,
  MIN_MAX_CHARS,
  STORAGE_KEY,
  defaultState,
  messageForCode,
  normalizeState,
  readStorageState,
  type DeepLUsage,
  type GetUsageResponse,
  type StorageState,
  type TestKeyResponse,
} from "../shared/messages";

function clampMaxChars(value: number): number {
  return Math.min(MAX_MAX_CHARS, Math.max(MIN_MAX_CHARS, value));
}

export function Popup() {
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(defaultState.enabled);
  const [shortcut, setShortcut] = useState<string | undefined>();
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [savedKey, setSavedKey] = useState<string | undefined>(defaultState.deeplApiKey);
  const [maxChars, setMaxChars] = useState(defaultState.maxChars);
  const [usage, setUsage] = useState<DeepLUsage | undefined>();
  const [testResult, setTestResult] = useState<TestKeyResponse | undefined>();
  const [usageLoading, setUsageLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void readStorageState().then((state) => {
      setEnabled(state.enabled);
      setApiKeyInput(state.deeplApiKey ?? "");
      setSavedKey(state.deeplApiKey);
      setMaxChars(state.maxChars);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local" || !(STORAGE_KEY in changes)) {
        return;
      }

      const state = normalizeState(changes[STORAGE_KEY]?.newValue as StorageState | undefined);
      setEnabled(state.enabled);
      setSavedKey(state.deeplApiKey);
      setMaxChars(state.maxChars);
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    if (!savedKey) {
      setUsage(undefined);
      setUsageLoading(false);
      return;
    }

    void refreshUsage();
  }, [savedKey]);

  useEffect(() => {
    void chrome.commands.getAll().then((commands) => {
      const toggleCommand = commands.find((command) => command.name === "toggle-enabled");
      setShortcut(toggleCommand?.shortcut || undefined);
    });
  }, []);

  async function updateStoredState(patch: Partial<StorageState>): Promise<StorageState> {
    const current = await readStorageState();
    const next = normalizeState({ ...current, ...patch });
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    return next;
  }

  async function refreshUsage() {
    setUsageLoading(true);
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "GET_USAGE",
      })) as GetUsageResponse;
      setUsage(response.ok ? response.usage : undefined);
      setTestResult(
        response.ok
          ? undefined
          : {
              ok: false,
              errorCode: response.errorCode ?? "UNKNOWN",
              error: response.error,
            },
      );
    } catch (err) {
      setUsage(undefined);
      setTestResult({
        ok: false,
        errorCode: "UNKNOWN",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setUsageLoading(false);
    }
  }

  async function saveApiKey() {
    setSaving(true);
    try {
      const next = await updateStoredState({ deeplApiKey: apiKeyInput.trim() || undefined });
      setSavedKey(next.deeplApiKey);
      setApiKeyInput(next.deeplApiKey ?? "");
      setTestResult(undefined);
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "TEST_KEY",
        key: apiKeyInput.trim(),
      })) as TestKeyResponse;
      setTestResult(response);
      if (response.ok) {
        setUsage(response.usage);
      }
    } catch (err) {
      setTestResult({
        ok: false,
        errorCode: "UNKNOWN",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  }

  const toggle = () => {
    void updateStoredState({ enabled: !enabled });
  };

  const setupMissing = !savedKey;
  const usagePercent = usage
    ? Math.min(100, Math.round((usage.character_count / Math.max(1, usage.character_limit)) * 100))
    : 0;
  const usageLevel = usagePercent >= 95 ? "danger" : usagePercent >= 80 ? "warn" : "ok";

  const handleMaxCharsChange = (value: string) => {
    const parsed = Number(value);
    const nextValue = Number.isNaN(parsed) ? defaultState.maxChars : clampMaxChars(parsed);
    setMaxChars(nextValue);
    void updateStoredState({ maxChars: nextValue });
  };

  return (
    <div className="popup">
      <h1>Hover Translate</h1>
      <p className="desc">Hover over text to translate between English ⇄ Japanese.</p>
      <section className="setup">
        <h2>Setup</h2>
        {setupMissing ? <div className="banner warn">Setup required</div> : null}
        <input
          type="password"
          placeholder="DeepL API key"
          value={apiKeyInput}
          onChange={(event) => setApiKeyInput(event.target.value)}
          disabled={!loaded}
        />
        <div className="row">
          <button type="button" onClick={() => void saveApiKey()} disabled={!loaded || saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" onClick={() => void testConnection()} disabled={!loaded || testing}>
            {testing ? "Testing..." : "Test Connection"}
          </button>
        </div>
        <a href="https://www.deepl.com/pro-api" target="_blank" rel="noreferrer">
          Get a free key at https://www.deepl.com/pro-api
        </a>
        {testResult ? (
          <p className={testResult.ok ? "status-text" : "error-text"}>
            {testResult.ok
              ? "Connection OK"
              : testResult.errorCode
                ? messageForCode(testResult.errorCode, maxChars)
                : testResult.error || "Connection test failed."}
          </p>
        ) : null}
      </section>

      <section className="toggle-section">
        <h2>Toggle</h2>
        <button
          type="button"
          className={`toggle ${enabled ? "on" : "off"}`}
          onClick={toggle}
          disabled={!loaded || setupMissing}
          title={setupMissing ? "Save an API key first" : undefined}
        >
          {enabled ? "ON" : "OFF"}
        </button>
        <p className="hint">
          Shortcut: {shortcut || "(unset)"}{" "}
          <a
            href="#"
            onClick={(event) => {
              event.preventDefault();
              void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
            }}
          >
            Change
          </a>
        </p>
      </section>

      {!setupMissing ? (
        <section className="quota">
          <div className="section-head">
            <h2>Quota</h2>
            <button type="button" onClick={() => void refreshUsage()} disabled={usageLoading}>
              {usageLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
          {usageLoading ? (
            <p>Loading usage...</p>
          ) : usage ? (
            <>
              <div className="bar" aria-hidden="true">
                <div className={`fill ${usageLevel}`} style={{ width: `${usagePercent}%` }} />
              </div>
              <p>
                {usage.character_count.toLocaleString()} / {usage.character_limit.toLocaleString()}{" "}
                characters ({usagePercent}% used)
              </p>
            </>
          ) : (
            <p className="error-text">Usage unavailable.</p>
          )}
        </section>
      ) : null}

      <section className="settings">
        <h2>Settings</h2>
        <label htmlFor="maxChars">Max characters per request</label>
        <input
          id="maxChars"
          type="number"
          min={MIN_MAX_CHARS}
          max={MAX_MAX_CHARS}
          step={100}
          value={maxChars}
          onChange={(event) => handleMaxCharsChange(event.target.value)}
          disabled={!loaded}
        />
        <p className="hint">Allowed range: 500 to 5000 characters.</p>
      </section>
    </div>
  );
}
