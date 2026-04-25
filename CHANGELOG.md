# Changelog

## [1.2.0] - 2026-04-26

### Added

- Copy button in the top-right corner of the translation tooltip. Click to copy the translated text to the clipboard; a checkmark confirms the action for about a second. The button is hidden during loading and on error states.

### Fixed

- Hovering the tooltip itself no longer triggers a self-translation of its own text.
- The clipboard fallback path (used when the async Clipboard API is unavailable) now preserves the user's text selection and focus instead of clobbering them.
- The copy button's `aria-label` now updates to "Copied" during the confirmation window so assistive tech reflects the visible state.

## [1.1.0] - 2026-04-18

### Added

- Send the adjacent paragraphs as DeepL `context` so the translation can take the surrounding discussion into account. Context is free on the DeepL side and noticeably lifts accuracy on short blocks.
- Request `preserve_formatting=1` and `split_sentences=nonewlines` so DeepL keeps line breaks, bullet markers, and code-like structure instead of flattening them.
- Show a `…` placeholder tooltip immediately after the hover or selection delay so the user sees that a request is in flight instead of silent waiting.

### Changed

- Tooltip now enforces a `max-height: 60vh` with internal scrolling so long translations stay readable on short viewports, and becomes interactive (`pointerEvents: auto`) so the scrollbar is usable.
- The tooltip hides as soon as the page scrolls, so it no longer floats over the wrong anchor after a scroll.

## [1.0.3] - 2026-04-18

### Fixed

- Hover translation no longer fails when the cursor moves between child elements (links, spans) inside the same paragraph — the hover timer is no longer reset on re-entering the same block.

### Changed

- Persist settings and the DeepL API key in `chrome.storage.sync` so they survive extension reinstall and sync across devices signed in to the same Chrome profile. Existing `chrome.storage.local` data is migrated automatically on first run.

## [1.0.2] - 2026-04-18

### Added

- Block selectors for Mintlify (`[data-as="p"]`), Twitter/X tweet text, and Notion public pages
- Generic fallback: walk ancestors to find the nearest block-level element with reasonable text when no known selector matches
- Skip translation when the cursor sits on padding, images, or non-text areas via `caretPositionFromPoint`

### Changed

- Simplify icon to moss green HT monogram

### CI

- Adopt hush-meet release infrastructure: CI workflow, tag-driven Release workflow, CHANGELOG + git-cliff, lefthook

### Documentation

- Document selection mode, mode/trigger switch, and shortcut scope changes in all pages (en/ja)
- Fix broken base-path links in LinkCards and inline links for GitHub Pages
- Refresh popup screenshots to show Mode/Trigger controls and footer links
- Clarify that DeepL Free quota resets monthly

## [1.0.1] - 2026-04-15

### Added

- Selection mode: translate the current text selection via `Alt+Shift+T` or automatically after mouseup
- Mode switch (Hover / Selection) and trigger switch (Shortcut / Auto) in the popup
- Popup footer links to the user guide and GitHub repository

### Changed

- Centralised storage state management through a single `updateStorageState` helper
- Tooltip anchors to the captured selection range so in-flight translations stay aligned
- Extracted `requestTranslation` and `resolveErrorMessage` helpers to remove duplication
- Widened Japanese detection regex to cover CJK Ext-A, compatibility ideographs, and halfwidth/fullwidth forms
- Distinct error message when the extension background is unavailable versus a real DeepL network error
- Replaced `innerText` with `textContent` in `extractText` to avoid layout thrash
- Popup caches DeepL `/v2/usage` for 30 seconds to reduce redundant API calls

### Fixed

- Popup toggle and storage state stayed out of sync after opening the popup
- Pending translations from a previous mode no longer overwrite the tooltip after a mode switch

## [1.0.0] - 2026-04-15

### Added

- Initial release
- Hover over any paragraph to translate between English and Japanese using DeepL Free API
- Automatic language detection (Japanese ⇄ English)
- Popup UI with Setup / Translate / Quota / Limits sections
- Keyboard shortcut support (`Alt+Shift+T`)
- LRU translation cache (100 entries)
- Configurable max characters per request (500–5000)
- Bilingual user guide site (English / Japanese) at https://s-hiraoku.github.io/hover-translate/
- Warm paper + coral editorial design system
