# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
pnpm install
pnpm dev      # Vite dev build with CRXJS hot reload → ./dist
pnpm build    # tsc -b && vite build (production)
pnpm test     # Vitest unit/integration suite
pnpm test:coverage
pnpm preview
pnpm zip      # build + zip dist for Chrome Web Store
```

Load the unpacked extension from `dist/` via `chrome://extensions`. There is no linter script configured yet.

## Testing

Vitest 4 runs the unit/integration suite in `jsdom` via `vitest.config.ts`; shared setup lives in `src/test/setup.ts`, with the reusable Chrome extension mock in `src/test/chrome-mock.ts`. Use `pnpm test` for the full run and `pnpm test:coverage` for V8 text/html coverage. Recent strategy notes put the suite at 225 tests and about 91% statement coverage; keep any thresholds in sync with `vitest.config.ts`.

Use `installChromeMock()` when a test needs realistic `chrome.storage`, `runtime`, command, or tab-message behavior. Prefer local `vi.fn()` overrides for one-off APIs or failure injection that would make the shared mock less clear. Vitest/jsdom covers module logic and DOM behavior; Playwright real-browser MV3 coverage is planned for service-worker lifecycle, permissions, commands, and native `Selection` behavior.

## Architecture

Chrome MV3 extension that translates hovered text blocks between English and Japanese. Three runtimes share state through `chrome.storage.local` and talk through `chrome.runtime.sendMessage`:

- **Content script** (`src/content/index.ts`) — listens on `<all_urls>`. On `mouseover`, walks up the DOM until it finds the nearest block element (`BLOCK_SELECTOR`) containing text, debounces ~300ms, detects language via `/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/` (Japanese → `ja`→`en`, else `en`→`ja`), and sends a `TRANSLATE` message to the background. Results render in a single floating `<div>` appended to `document.documentElement` with `z-index: 2147483647`. The content script does not memoize per element; duplicate completed translations are served by the background LRU cache, while `currentGeneration` invalidates stale in-flight hover responses after mode changes or cursor movement. Known limitation: in-flight identical requests are not deduplicated, so rapid re-hover before the first response resolves can produce duplicate DeepL calls.

- **Background service worker** (`src/background/service-worker.ts`) — receives `TRANSLATE`, `GET_USAGE`, and `TEST_KEY` messages and returns `true` for async `sendResponse` paths. `translator.ts` calls the official DeepL Free API at `https://api-free.deepl.com/v2/{translate,usage}` using the stored API key as a `DeepL-Auth-Key` authorization header. `deepl-client.ts` maps 403→`INVALID_KEY`, 456→`QUOTA_EXCEEDED`, 429→`RATE_LIMITED`, 5xx→`SERVER_ERROR`, and fetch failures→`NETWORK_ERROR`; `translator.ts` also keeps a best-effort service-worker LRU cache (`CACHE_MAX = 100`).

- **Popup** (`src/popup/`) — React 19 UI for DeepL API key setup, save/test actions, ON/OFF state, hover vs selection mode, selection trigger, request-size limits, quota display, and shortcut discovery. It reads/writes `chrome.storage.local[STORAGE_KEY]` and uses background `GET_USAGE` / `TEST_KEY` messages for DeepL checks; the content script picks up setting changes via `storage.onChanged`.

**Storage initialization:** `ensureStorageInitialized` runs at service-worker cold start and on `runtime.onInstalled`. It is idempotent: existing local state is preserved, sync state is migrated to local once and then removed, and the intended end-state is one valid local `STORAGE_KEY` value with no sync `STORAGE_KEY`.

**Shared contract:** `src/shared/messages.ts` defines `TranslateRequest`, `TranslateResponse`, `StorageState`, and the `STORAGE_KEY = "hoverTranslateState"` constant. All three runtimes must import from here — this file is the only cross-runtime coupling point.

**Manifest:** `src/manifest.ts` uses `@crxjs/vite-plugin`'s `defineManifest`. `name`/`description` are `__MSG_*__` keys resolved from `public/_locales/{en,ja}/messages.json`. Adding a new permission or content script match requires editing this file (not a static `manifest.json`).

**Build pipeline:** `vite.config.ts` wires `@crxjs/vite-plugin` with the `manifest.ts` export — CRXJS rewrites entry paths and emits a valid MV3 `manifest.json` into `dist/`. TypeScript is strict with `noUnusedLocals`, `noUnusedParameters`, and `erasableSyntaxOnly`; use `import type` for type-only imports.

## Decisions

- WeakMap memoization is not implemented in the content script; future work is in-flight request de-duplication, not per-element caching.
- Storage initialization should converge to `defaultState` or migrated sync state in local storage, remove sync state, and avoid double-writing local state.
- Manifest shape is expected to be covered by `src/manifest.test.ts` from the manifest-test task; restore or add that file before relying on the claim in a branch where it is missing.
- Vitest + jsdom is the default unit/integration layer. Playwright is planned separately for MV3 lifecycle, command routing, permissions, and real selection E2E.
- Open questions: runtime validation of numeric DeepL usage fields, locale/store-listing key parity tests, and whether to add a manual DeepL contract check with a real key.

## Reference project

The sibling directory `../hush-meet` is the structural template this project was scaffolded from (same Vite + React + CRXJS + TypeScript stack). Consult it when adding features like i18n helpers, storage sync patterns, or popup components.

## Role split (Claude vs Codex)

This project uses a two-agent workflow coordinated via Synapse A2A:

- **Claude** — planning, code review, project management, coordination. Writes specs, breaks work into phases, reviews diffs, manages task lists, delegates to Codex, and handles user communication. Does **not** write the primary implementation.
- **Codex** — implementation. Writes the actual production code based on Claude's plans. Launched per-project with `synapse spawn codex` (single agent, interactive terminal pane the user can monitor) or `synapse team start` (multi-agent). **Do not use `synapse start codex`** — it runs headless in the background and the user cannot observe progress.

When a new feature is requested:

1. Claude produces an implementation plan (phases, file-by-file changes, decisions to confirm).
2. User approves the plan and any open decisions.
3. Claude delegates implementation to the project's Codex agent via `synapse send`, with explicit file ownership boundaries to prevent edit conflicts.
4. Codex reports completion; Claude reviews the diff, runs `pnpm build`, and reports back to the user.

Claude may write code directly only for: scaffolding, trivial fixes, configuration tweaks, or when Codex is unavailable/blocked. Anything non-trivial should be delegated.

<!-- BEGIN RIG INSTRUCTIONS -->
<!-- Suggested for CLAUDE.md or Claude project instructions. -->

## Rig

Read `.rig/instructions/rig.md` for Rig usage policy, artifact inspection rules, and patch-apply safety rules.
<!-- END RIG INSTRUCTIONS -->
