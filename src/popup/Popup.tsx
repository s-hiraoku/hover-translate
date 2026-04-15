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
      <header>
        <h1>
          Hover <span className="accent">Translate</span>
        </h1>
        <p className="desc">
          Hover any block. English <span className="glyph">⇄</span> Japanese, instantly.
        </p>
        <div className="header-rule">
          <span className="issue">№ 01 · DeepL Edition</span>
        </div>
      </header>

      <section className="section setup-section">
        <div className="section-head">
          <h2>Setup</h2>
          <span className="num">01 / 04</span>
        </div>
        {setupMissing ? <div className="banner">API key required</div> : null}
        <div className="field">
          <span className="field-label">DeepL API Key</span>
          <input
            type="password"
            placeholder="Paste your key here"
            value={apiKeyInput}
            onChange={(event) => setApiKeyInput(event.target.value)}
            disabled={!loaded}
          />
        </div>
        <div className="button-row">
          <button
            type="button"
            className="btn"
            onClick={() => void saveApiKey()}
            disabled={!loaded || saving}
          >
            {saving ? "Saving" : "Save"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void testConnection()}
            disabled={!loaded || testing}
          >
            {testing ? "Testing" : "Test"}
          </button>
        </div>
        <a
          className="helper-link"
          href="https://www.deepl.com/pro-api"
          target="_blank"
          rel="noreferrer"
        >
          Get a free key at <u>deepl.com/pro-api</u>
        </a>
        {testResult ? (
          <p className={`inline-msg ${testResult.ok ? "ok" : "err"}`}>
            {testResult.ok
              ? "Connection verified."
              : testResult.errorCode
                ? messageForCode(testResult.errorCode, maxChars)
                : testResult.error || "Connection test failed."}
          </p>
        ) : null}
      </section>

      <section className="section toggle-section">
        <div className="section-head">
          <h2>Translate</h2>
          <span className="num">02 / 04</span>
        </div>
        <div className="toggle-wrap">
          <div className="toggle-label">
            <span className={`status ${enabled ? "is-on" : "is-off"}`}>
              {enabled ? "Active" : "Idle"}
            </span>
            <span className="sub">
              {setupMissing ? "Save a key first" : enabled ? "Hovering · live" : "Press to enable"}
            </span>
          </div>
          <button
            type="button"
            className={`toggle ${enabled ? "on" : "off"}`}
            onClick={toggle}
            disabled={!loaded || setupMissing}
            title={setupMissing ? "Save an API key first" : undefined}
            aria-label={enabled ? "Disable hover translation" : "Enable hover translation"}
          />
        </div>
        <div className="shortcut">
          <span className="label">Shortcut</span>
          <span className={`kbd ${shortcut ? "" : "unset"}`}>{shortcut || "unset"}</span>
          <a
            className="change"
            href="#"
            onClick={(event) => {
              event.preventDefault();
              void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
            }}
          >
            Change
          </a>
        </div>
      </section>

      {!setupMissing ? (
        <section className="section quota-section">
          <div className="section-head">
            <h2>Quota</h2>
            <span className="num">03 / 04</span>
          </div>
          {usageLoading ? (
            <p className="quota-loading">Loading usage</p>
          ) : usage ? (
            <>
              <div className="quota-bar" aria-hidden="true">
                <div
                  className={`quota-fill ${usageLevel}`}
                  style={{ width: `${Math.max(usagePercent, 2)}%` }}
                />
              </div>
              <div className="quota-readout">
                <span className="numbers">
                  {usage.character_count.toLocaleString()} /{" "}
                  {usage.character_limit.toLocaleString()}
                </span>
                <span className="percent">{usagePercent}%</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-tiny"
                onClick={() => void refreshUsage()}
                disabled={usageLoading}
              >
                Refresh
              </button>
            </>
          ) : (
            <p className="quota-empty">Usage unavailable.</p>
          )}
        </section>
      ) : null}

      <section className="section settings-section">
        <div className="section-head">
          <h2>Limits</h2>
          <span className="num">04 / 04</span>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="maxChars">
            Max characters per request
          </label>
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
        </div>
        <p className="hint">Range 500 – 5,000</p>
      </section>

      <footer className="popup-footer">
        <a
          href="https://s-hiraoku.github.io/hover-translate/"
          target="_blank"
          rel="noreferrer"
        >
          User guide
        </a>
        <span className="sep">·</span>
        <a
          href="https://github.com/s-hiraoku/hover-translate"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}
