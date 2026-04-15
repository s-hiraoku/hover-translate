# Changelog

## [1.0.1] - 2026-04-15

### Added

- Selection mode: translate the current text selection via `Alt+Shift+T` or automatically after mouseup
- Mode switch (Hover / Selection) and trigger switch (Shortcut / Auto) in the popup
- Popup footer links to the user guide and GitHub repository
- Monthly DeepL Free quota reset is now documented in the user guide

### Changed

- Centralised storage state management through a single `updateStorageState` helper
- Tooltip anchors to the captured selection range so in-flight translations stay aligned when the selection changes
- Extracted `requestTranslation` and `resolveErrorMessage` helpers to remove duplication between hover and selection paths
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
