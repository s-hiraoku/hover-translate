import { useEffect, useState } from "react";
import {
  createTranslator,
  hasBuiltInTranslator,
  translatorAvailability,
} from "../shared/browser-ai";
import {
  MAX_MAX_CHARS,
  MIN_MAX_CHARS,
  STORAGE_KEY,
  clampMaxChars,
  defaultState,
  messageForCode,
  normalizeState,
  readStorageState,
  updateStorageState,
  type Mode,
  type SelectionTrigger,
} from "../shared/messages";

type TranslatorStatus = "checking" | "unsupported" | "ready" | "needs-download" | "preparing";

export function Popup() {
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(defaultState.enabled);
  const [mode, setMode] = useState<Mode>(defaultState.mode);
  const [selectionTrigger, setSelectionTrigger] = useState<SelectionTrigger>(
    defaultState.selectionTrigger,
  );
  const [shortcut, setShortcut] = useState<string | undefined>();
  const [maxChars, setMaxChars] = useState(defaultState.maxChars);
  const [translatorStatus, setTranslatorStatus] = useState<TranslatorStatus>("checking");
  const [prepareProgress, setPrepareProgress] = useState(0);

  useEffect(() => {
    void readStorageState().then((state) => {
      setEnabled(state.enabled);
      setMode(state.mode);
      setSelectionTrigger(state.selectionTrigger);
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

      const state = normalizeState(changes[STORAGE_KEY]?.newValue);
      setEnabled(state.enabled);
      setMode(state.mode);
      setSelectionTrigger(state.selectionTrigger);
      setMaxChars(state.maxChars);
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    void refreshTranslatorStatus();
  }, []);

  useEffect(() => {
    void chrome.commands.getAll().then((commands) => {
      const translateSelectionCommand = commands.find(
        (command) => command.name === "translate-selection",
      );
      setShortcut(translateSelectionCommand?.shortcut || undefined);
    });
  }, []);

  async function refreshTranslatorStatus() {
    if (!hasBuiltInTranslator()) {
      setTranslatorStatus("unsupported");
      return;
    }

    setTranslatorStatus("checking");
    const [enToJa, jaToEn] = await Promise.all([
      translatorAvailability({ sourceLanguage: "en", targetLanguage: "ja" }),
      translatorAvailability({ sourceLanguage: "ja", targetLanguage: "en" }),
    ]);
    setTranslatorStatus(enToJa === "available" && jaToEn === "available" ? "ready" : "needs-download");
  }

  async function prepareLanguagePacks() {
    setTranslatorStatus("preparing");
    setPrepareProgress(0);

    try {
      const pairs = [
        { sourceLanguage: "en", targetLanguage: "ja" },
        { sourceLanguage: "ja", targetLanguage: "en" },
      ] as const;

      for (const [index, pair] of pairs.entries()) {
        const translator = await createTranslator(pair, (progress) => {
          const loaded = Number.isFinite(progress.loaded) ? progress.loaded : 0;
          setPrepareProgress(Math.round(((index + loaded) / pairs.length) * 100));
        });
        translator.destroy?.();
        setPrepareProgress(Math.round(((index + 1) / pairs.length) * 100));
      }
      setTranslatorStatus("ready");
    } catch {
      setTranslatorStatus("needs-download");
    }
  }

  const translatorReady = translatorStatus === "ready";
  const translatorUnsupported = translatorStatus === "unsupported";

  const handleMaxCharsChange = (value: string) => {
    const parsed = Number(value);
    const nextValue = Number.isNaN(parsed) ? defaultState.maxChars : clampMaxChars(parsed);
    setMaxChars(nextValue);
    void updateStorageState({ maxChars: nextValue });
  };

  function subLabelForMode(currentMode: Mode, currentTrigger: SelectionTrigger): string {
    if (currentMode === "hover") return "Hovering · live";
    if (currentTrigger === "shortcut") return "Selection · ⌥⇧T";
    return "Selection · auto";
  }

  function translatorStatusText(): string {
    switch (translatorStatus) {
      case "checking":
        return "Checking browser support";
      case "unsupported":
        return messageForCode("TRANSLATOR_UNSUPPORTED");
      case "ready":
        return "Ready for English ⇄ Japanese";
      case "needs-download":
        return "Prepare language packs before first use";
      case "preparing":
        return `Preparing language packs ${prepareProgress}%`;
    }
  }

  return (
    <div className="popup">
      <header>
        <h1>
          Hover <span className="accent">Translate</span>
        </h1>
        <p className="desc">
          Hover any block. English <span className="glyph">⇄</span> Japanese, locally.
        </p>
        <div className="header-rule">
          <span className="issue">№ 02 · Built-in Edition</span>
        </div>
      </header>

      <section className="section setup-section">
        <div className="section-head">
          <h2>Engine</h2>
          <span className="num">01 / 03</span>
        </div>
        {translatorUnsupported ? <div className="banner">Chrome 138+ desktop required</div> : null}
        <p className={`inline-msg ${translatorReady ? "ok" : translatorUnsupported ? "err" : ""}`}>
          {translatorStatusText()}
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => void prepareLanguagePacks()}
          disabled={
            !loaded ||
            translatorStatus === "checking" ||
            translatorStatus === "unsupported" ||
            translatorStatus === "ready" ||
            translatorStatus === "preparing"
          }
        >
          {translatorStatus === "preparing" ? "Preparing" : "Prepare"}
        </button>
      </section>

      <section className="section toggle-section">
        <div className="section-head">
          <h2>Translate</h2>
          <span className="num">02 / 03</span>
        </div>
        <div className="toggle-wrap">
          <div className="toggle-label">
            <span className={`status ${enabled ? "is-on" : "is-off"}`}>
              {enabled ? "Active" : "Idle"}
            </span>
            <span className="sub">
              {translatorUnsupported
                ? "Unsupported browser"
                : enabled
                  ? subLabelForMode(mode, selectionTrigger)
                  : "Press to enable"}
            </span>
          </div>
          <button
            type="button"
            className={`toggle ${enabled ? "on" : "off"}`}
            onClick={async () => {
              const current = await readStorageState();
              await updateStorageState({ enabled: !current.enabled });
            }}
            disabled={!loaded || translatorUnsupported}
            title={translatorUnsupported ? messageForCode("TRANSLATOR_UNSUPPORTED") : undefined}
            aria-label={enabled ? "Disable translation" : "Enable translation"}
          />
        </div>
        <div className="segment-group">
          <span className="field-label">Mode</span>
          <div className="segment">
            <button
              type="button"
              className={`seg ${mode === "hover" ? "active" : ""}`}
              onClick={() => void updateStorageState({ mode: "hover" })}
              disabled={!enabled}
            >
              Hover
            </button>
            <button
              type="button"
              className={`seg ${mode === "selection" ? "active" : ""}`}
              onClick={() => void updateStorageState({ mode: "selection" })}
              disabled={!enabled}
            >
              Selection
            </button>
          </div>
        </div>
        {mode === "selection" ? (
          <div className="segment-group">
            <span className="field-label">Trigger</span>
            <div className="segment">
              <button
                type="button"
                className={`seg ${selectionTrigger === "shortcut" ? "active" : ""}`}
                onClick={() => void updateStorageState({ selectionTrigger: "shortcut" })}
                disabled={!enabled}
              >
                Shortcut
              </button>
              <button
                type="button"
                className={`seg ${selectionTrigger === "auto" ? "active" : ""}`}
                onClick={() => void updateStorageState({ selectionTrigger: "auto" })}
                disabled={!enabled}
              >
                Auto
              </button>
            </div>
          </div>
        ) : null}
        {mode === "selection" && selectionTrigger === "shortcut" ? (
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
        ) : null}
      </section>

      <section className="section settings-section">
        <div className="section-head">
          <h2>Limits</h2>
          <span className="num">03 / 03</span>
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
