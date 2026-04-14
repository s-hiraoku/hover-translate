# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
pnpm install
pnpm dev      # Vite dev build with CRXJS hot reload → ./dist
pnpm build    # tsc -b && vite build (production)
pnpm preview
pnpm zip      # build + zip dist for Chrome Web Store
```

Load the unpacked extension from `dist/` via `chrome://extensions`. There is no test runner or linter configured yet.

## Architecture

Chrome MV3 extension that translates hovered text blocks between English and Japanese. Three runtimes share state through `chrome.storage.local` and talk through `chrome.runtime.sendMessage`:

- **Content script** (`src/content/index.ts`) — listens on `<all_urls>`. On `mouseover`, walks up the DOM until it finds the nearest block element (`BLOCK_SELECTOR`) containing text, debounces ~300ms, detects language via `/[\u3040-\u30ff\u4e00-\u9fff]/` (Japanese → `ja`→`en`, else `en`→`ja`), and sends a `TRANSLATE` message to the background. Results render in a single floating `<div>` appended to `document.documentElement` with `z-index: 2147483647`. Per-element results are memoized in a `WeakMap`. The script subscribes to `chrome.storage.onChanged` so toggling the popup immediately enables/disables hover behavior without a reload.

- **Background service worker** (`src/background/service-worker.ts`) — receives `TranslateRequest` messages and delegates to `translator.ts`. The handler returns `true` to keep the `sendResponse` channel open for the async fetch. `translator.ts` currently calls the **unofficial** `translate.googleapis.com/translate_a/single` endpoint as a zero-key placeholder; swap for Google Cloud Translation API / DeepL before shipping.

- **Popup** (`src/popup/`) — React 19 UI with a single ON/OFF toggle that reads/writes `chrome.storage.local[STORAGE_KEY]`. It does not talk to the content script directly; the content script picks up changes via `storage.onChanged`.

**Shared contract:** `src/shared/messages.ts` defines `TranslateRequest`, `TranslateResponse`, `StorageState`, and the `STORAGE_KEY = "hoverTranslateState"` constant. All three runtimes must import from here — this file is the only cross-runtime coupling point.

**Manifest:** `src/manifest.ts` uses `@crxjs/vite-plugin`'s `defineManifest`. `name`/`description` are `__MSG_*__` keys resolved from `public/_locales/{en,ja}/messages.json`. Adding a new permission or content script match requires editing this file (not a static `manifest.json`).

**Build pipeline:** `vite.config.ts` wires `@crxjs/vite-plugin` with the `manifest.ts` export — CRXJS rewrites entry paths and emits a valid MV3 `manifest.json` into `dist/`. TypeScript is strict with `noUnusedLocals`, `noUnusedParameters`, and `erasableSyntaxOnly`; use `import type` for type-only imports.

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
