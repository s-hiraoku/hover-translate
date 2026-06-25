# Playwright E2E Design

## Scope

Hover Translate now uses Chrome's built-in Translator API from the content script. E2E coverage should verify extension wiring, UI behavior, and graceful fallback paths without relying on external translation services.

## Constraints

- Built-in Translator API availability depends on desktop Chrome version, device capability, profile state, and language-pack downloads.
- Model downloads may require a user gesture and enough free disk space.
- CI may not expose the native API, so deterministic E2E should include a way to inject a fixture page/mock API surface for content-script behavior.

## Recommended E2E Cases

### Popup readiness

Seed default storage, open the popup, and assert:

- **Engine** renders.
- No API key field appears.
- Unsupported-browser state disables translation when `Translator` is unavailable.
- Downloadable state enables **Prepare**.

### Hover translation

Open a fixture page with English and Japanese paragraphs. With a controllable Translator API mock, assert:

- Hovering an English paragraph calls English → Japanese.
- Hovering a Japanese paragraph calls Japanese → English.
- The translated text appears in the tooltip.
- The copy button copies translated text.

### Selection translation

Open a fixture page, create a real text selection, and assert:

- Selection + Auto translates on mouse release.
- Selection + Shortcut translates after the `TRANSLATE_SELECTION` message path.
- Inputs, textareas, contenteditable regions, and opt-out elements are ignored.

### Error paths

Assert user-facing messages for:

- unsupported browser / missing `Translator`
- language pack download requiring a click
- text exceeding `maxChars`
- generic Translator API failure

### Service worker command routing

Assert the `translate-selection` command is declared and that the service worker sends `{ type: "TRANSLATE_SELECTION" }` to the active tab when settings allow it.

## Out of Scope

- Live translation quality checks.
- Forcing Chrome to download real language packs in PR CI.
- Testing DeepL, quota, or external API behavior.
