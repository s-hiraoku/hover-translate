# Playwright E2E Design

## 1. Goals and non-goals

The v1 Playwright suite should be a small smoke layer for behavior that jsdom cannot prove: real Chrome extension loading, MV3 service-worker messaging, native selection/range behavior, and browser caret hit testing. It should complement the Vitest suite, not replace the current 225-test unit/integration baseline.

Ranked v1 smoke specs:

1. Hover translates a real paragraph and renders the content-script tooltip.
2. Auto selection mode translates a real browser `Selection` after mouse release.
3. Missing-key error renders in the page without calling DeepL.
4. Service worker responds to an async `TRANSLATE` message after extension reload or worker reacquisition.
5. Cursor gating suppresses hover translation when the pointer is over whitespace/layout gap and allows it over text.

I would ship 3 specs first: hover, auto-selection, and missing-key. Add the service-worker lifecycle smoke immediately after the harness is stable, because it is valuable but more prone to browser-version noise. Treat cursor gating as the first expansion spec: the `caretPositionFromPoint` / `caretRangeFromPoint` branches are exactly why a real browser is useful, but the assertions need careful fixture geometry to avoid flakes.

Non-goals for E2E:

- UI snapshot regressions: popup and tooltip CSS should stay in unit/component tests or manual visual checks unless a specific layout bug recurs.
- Popup CSS details: E2E should only prove extension URL loading and critical storage/message behavior; CSS coverage is high cost and low signal here.
- Every locale: manifest locale key parity can be unit-tested; one E2E browser locale is enough for v1.
- Every `chrome.*` edge case: the goal is a smoke proof of the extension contract, not a browser API compatibility suite.
- Live DeepL coverage on every run: request construction and error mapping are already unit-tested; live API checks need secrets, quota, network stability, and a manual/optional workflow.
- Restricted Chrome pages and Web Store injection policy: content scripts cannot run on some pages by design, so keep that in manual smoke unless a product claim depends on it.

## 2. Loader strategy

`@playwright/test` with `chromium.launchPersistentContext`, `--load-extension=./dist`, and `--disable-extensions-except=./dist` is the standard Playwright extension recipe. It uses the normal Playwright test runner, fixtures, tracing, retries, routes, and CI reporter while still loading the unpacked CRXJS build. The persistent context is important because Chromium only supports extension loading through launch arguments on a browser context with a user data directory.

`playwright-chromium` with manifest v3 service-worker access through `context.serviceWorkers()` and `serviceWorker.evaluate()` is not a separate strategic path so much as the low-level package behind Playwright's Chromium launcher. It can work, but using it directly gives up `@playwright/test` fixtures and config for little benefit. The needed MV3 access is available from `@playwright/test`'s `chromium` export.

Community helpers such as `playwright-extension-helper` exist, but I would not choose one for this project unless it is actively maintained and demonstrably supports MV3 service workers. The harness needed here is small: build, launch persistent context, get the service worker, derive the extension id, seed storage, and route DeepL. Adding a helper would add another compatibility surface around a browser feature that changes often.

Chosen approach: `@playwright/test` plus `chromium.launchPersistentContext` with explicit extension flags. This is the most stable option for the project because it stays close to official Playwright APIs, gives direct access to MV3 service workers, and avoids production-source changes.

Build and launch flow:

```sh
pnpm build
pnpm e2e
```

The Playwright global setup or a test fixture should run `pnpm build` before the first spec. CRXJS writes the MV3 extension to `dist/`: `dist/manifest.json`, `dist/service-worker-loader.js`, hashed assets under `dist/assets/`, popup HTML emitted under `dist/assets/`, and copied icons under `dist/icons/`. Do not point Playwright at `src/`; load `dist/`.

Launch sketch:

```ts
const pathToExtension = path.resolve("dist");
const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "hover-translate-e2e-"));

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${pathToExtension}`,
    `--load-extension=${pathToExtension}`,
  ],
});
```

Open test pages as normal web pages, not extension pages. Use either `page.setContent(...)` on `about:blank` if the content script injection is not needed for that assertion, or preferably a Playwright-hosted fixture page from `e2e/fixtures/hover.html` so Chrome injects the content script through the manifest's `<all_urls>` match. For content-script E2E, prefer the hosted page.

Reach the extension service worker with:

```ts
const [serviceWorker] = context.serviceWorkers().length
  ? context.serviceWorkers()
  : [await context.waitForEvent("serviceworker")];
const extensionId = serviceWorker.url().split("/")[2];
```

Use the service worker to seed storage and inspect messaging behavior. For popup specs, navigate directly to `chrome-extension://${extensionId}/src/popup/index.html` if CRXJS preserves that extension path at runtime; otherwise inspect `dist/manifest.json`'s `action.default_popup` and resolve that path against the extension id. Popup rendering and form details should mostly remain in the existing jsdom suite; Playwright popup coverage should be limited to extension URL loading, storage read/write integration, and command display if needed.

## 3. Storage seeding strategy

Option 1: evaluate inside the service worker:

```ts
await serviceWorker.evaluate(
  async ({ key, state }) => {
    await chrome.storage.local.set({ [key]: state });
  },
  { key: STORAGE_KEY, state },
);
```

This is the best fit. It writes through the real extension API before the content page loads, does not depend on popup rendering, and does not require test-only production messages.

Option 2: evaluate inside the popup page after navigating to it. This works because the popup is an extension context with `chrome.storage.local`, but it couples all specs to popup loading and makes content tests slower. It is useful as a fallback if a browser version makes service-worker evaluation unreliable.

Option 3: add a test-only background message such as `SET_STORAGE_FOR_TEST`. This is not worth the production-source change for v1. It widens the shared message contract and creates code that only exists for tests, while service-worker evaluation gives the same control from the outside.

Chosen strategy: `serviceWorker.evaluate(...)`, with full normalized state built in the test helper from `defaultState`.

Helper signature:

```ts
async function seedExtensionState(state: Partial<StorageState>): Promise<void>;
```

Implementation sketch:

```ts
async function seedExtensionState(state: Partial<StorageState>) {
  const nextState = { ...defaultState, ...state };
  await serviceWorker.evaluate(
    async ({ key, value }) => {
      await chrome.storage.local.set({ [key]: value });
    },
    { key: STORAGE_KEY, value: nextState },
  );
}
```

Each spec should start from a fresh persistent context where possible. If runtime cost is too high, reuse a worker-scoped context and call `chrome.storage.local.clear()` plus `seedExtensionState(...)` in `beforeEach`, but v1 should favor isolation over speed.

## 4. Smoke specs

### `e2e/hover-translation.spec.ts`

Setup: serve a fixture page with adjacent paragraphs so `buildContext` has previous/next text, seed `{ enabled: true, mode: "hover", selectionTrigger: "shortcut", deeplApiKey: "test-key", maxChars: 1500 }`, and mock DeepL with `context.route("https://api-free.deepl.com/v2/translate", route => route.fulfill(...))`.

Steps:

```ts
await page.goto(fixtureUrl("/hover.html"));
await page.locator("#english-paragraph").hover();
await expect(page.locator('[data-hover-translate-tooltip="true"]')).toContainText("こんにちは");
```

Assert: one DeepL request is made with `text=Hello world from the fixture`, `source_lang=EN`, `target_lang=JA`, and the tooltip shows the mocked translation. Also assert the tooltip is visible and not marked as an error.

DeepL: mocked with `route.fulfill`. Do not hit live DeepL in v1 because CI would need a secret, consume quota, and turn product tests into network tests.

### `e2e/selection-auto.spec.ts`

Setup: fixture page with a paragraph containing selectable text plus an `input`, `textarea`, and `[contenteditable="true"]` block. Seed `{ enabled: true, mode: "selection", selectionTrigger: "auto", deeplApiKey: "test-key" }`. Mock DeepL translate.

Steps:

```ts
await page.goto(fixtureUrl("/selection.html"));
await page.evaluate(() => {
  const text = document.querySelector("#selection-source")!.firstChild!;
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, 19);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
});
await page.locator("#selection-source").dispatchEvent("mouseup");
await expect(page.locator('[data-hover-translate-tooltip="true"]')).toContainText("選択結果");
```

Assert: request text is whitespace-normalized, only one translate request is sent, and selected text inside skipped controls does not send. The tooltip should anchor near `Range.getBoundingClientRect()`; assert visibility and text, not exact pixels.

DeepL: mocked.

### `e2e/shortcut-command.spec.ts`

Setup: seed `{ enabled: true, mode: "selection", selectionTrigger: "shortcut", deeplApiKey: "test-key" }`, open a fixture page, create a real selection, and mock DeepL.

Steps: the desired product path is Chrome command `translate-selection` -> service worker `chrome.tabs.query` -> `chrome.tabs.sendMessage` -> content script `TRANSLATE_SELECTION`. Playwright does not reliably simulate Chrome global extension commands or `chrome://extensions/shortcuts` assignments. A partial automation could call `serviceWorker.evaluate(() => chrome.commands.getAll())` to assert the command exists, but it would not prove the keyboard path.

Assert: do not ship this as an automated v1 spec. Keep it in the manual smoke checklist. If automation is later attempted, prove command metadata and manually trigger the content-script message from an extension context, clearly labeling it as a partial command-path test.

DeepL: mocked if automated later.

### `e2e/missing-key.spec.ts`

Setup: fixture paragraph, seed `{ enabled: true, mode: "hover", deeplApiKey: undefined }`, and install a DeepL route that fails the test if called.

Steps:

```ts
await page.goto(fixtureUrl("/hover.html"));
await page.locator("#english-paragraph").hover();
await expect(page.locator('[data-hover-translate-tooltip="true"]')).toContainText(
  "Set your DeepL API key from the extension popup.",
);
```

Assert: the page renders the shared missing-key message, tooltip is in error state, and no request reaches `https://api-free.deepl.com/v2/translate`.

DeepL: mocked as "must not be called".

### `e2e/background-lifecycle.spec.ts`

Setup: seed enabled hover state with a fake key and route DeepL with a delayed response, e.g. fulfill after 500 ms. Open a fixture page so a content script can send a real `TRANSLATE` message. Reacquire the MV3 service worker with `context.serviceWorkers()` or `context.waitForEvent("serviceworker")` after closing pages or reloading the extension context.

Steps:

```ts
await page.goto(fixtureUrl("/hover.html"));
await page.locator("#english-paragraph").hover();
await expect(page.locator('[data-hover-translate-tooltip="true"]')).toContainText("遅延応答");
```

Assert: the response arrives after the async background fetch path, proving `sendResponse` stayed open. A stronger version can send `chrome.runtime.sendMessage({ type: "TRANSLATE", ... })` from an extension page and assert the response after worker reacquisition.

DeepL: mocked with a deliberate delay. Do not depend on actually forcing Chrome to terminate the worker; use reload/reacquisition as a smoke approximation and keep exact idle termination manual.

Recommendation: ship 3 specs in v1: hover, selection-auto, missing-key. Prepare the harness so background-lifecycle and cursor-gating can be added without redesign.

## 5. CI integration

Run E2E on pull requests to `main` after the unit suite, with one retry on CI. The value is high because these tests catch extension-loading and content-script regressions that Vitest cannot. The cost is acceptable for 3 specs: Chromium download is roughly 150 MB, `pnpm build` is already required for release confidence, and the spec runtime should stay under a few minutes. If flakes appear, temporarily move the workflow to manual plus nightly rather than deleting the suite.

Config should live at repo root as `playwright.config.ts`, with specs and fixtures under `e2e/`. Add scripts later:

```json
{
  "e2e": "playwright test",
  "e2e:headed": "playwright test --headed"
}
```

GitHub Actions sketch:

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: ms-playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test
      - run: pnpm build
      - run: pnpm e2e
```

## 6. Dependencies and effort estimate

Add:

```sh
pnpm add -D @playwright/test@^1.59.1
pnpm exec playwright install chromium
```

No separate `playwright-chromium` dependency is needed because `@playwright/test` includes the runner and browser launcher packages. No peer dependencies are expected.

Conservative effort:

- Harness, config, build hook, extension fixture helpers: 4-6 hours.
- Storage seeding and DeepL routing helpers: 2-3 hours.
- Hover, selection-auto, missing-key specs: 5-8 hours.
- Background lifecycle and cursor-gating expansion specs: 5-8 hours.
- CI integration: 2-4 hours.
- Flake stabilization budget: 4-8 hours after the first CI runs.

Manual-smoke checklist to ship alongside E2E:

- Load `dist/` from `chrome://extensions` in developer mode.
- Save and test a real DeepL Free API key once before release.
- Verify hover translation on English text and Japanese text.
- Verify selection auto mode on normal page text.
- Verify selection shortcut mode with `Alt+Shift+T`.
- Verify disabled state stops new hover and selection translations immediately.
- Verify `chrome://extensions/shortcuts` opens from the popup Change link.
- Verify restricted pages fail quietly without user-visible extension errors.

## 7. Risks and open questions

Browser version pinning: Playwright pins its own Chromium revision through `@playwright/test`. That improves reproducibility but means CI is not exactly the user's installed Google Chrome. Pin the npm version in `pnpm-lock.yaml`, and update intentionally when browser behavior changes.

Chromium versus Google Chrome: Playwright's Chromium is not branded Chrome. Most MV3 APIs used here are available, including extension service workers, `chrome.storage`, runtime messaging, and content-script injection. Known risk areas are Chrome Web Store/restricted-page policy, shortcut assignment UI under `chrome://extensions/shortcuts`, and any Chrome-account or enterprise-policy behavior. None are v1 automation targets.

Test isolation: prefer a fresh persistent context per spec file, with storage cleared and reseeded before each test. This costs more than sharing one context, but avoids state leakage from service-worker caches, storage, and content-script globals. If runtime becomes a problem, move to one worker-scoped context after the first stable version.

Headless versus headed: extension loading has historically been constrained in old headless modes. Start with headed Chromium in CI through Xvfb only if current Playwright headless cannot load the MV3 extension reliably. If headless works with the pinned Playwright version, use headless in CI and keep `e2e:headed` for local debugging.

Service-worker lifecycle: deliberately forcing MV3 idle termination is browser-dependent and can be flaky. The v1 lifecycle smoke should prove async response delivery and worker reacquisition, not exact Chrome idle timing.

Long-term cost: this suite should stay small. Every E2E spec carries browser-download cost, fixture upkeep, and flake triage. Keep broad behavior in Vitest and use Playwright only for APIs and browser behaviors jsdom cannot model.

Open questions:

- Should `pnpm build` be run by `playwright.config.ts` `webServer`, by global setup, or by the CI script before `pnpm e2e`?
- Should popup extension-page loading be included in v1, or left to jsdom until a popup integration bug appears?
- How strict should cursor-gating assertions be around exact fixture coordinates?
- Should a live DeepL contract check exist as a manual workflow with a secret, separate from PR E2E?

## Decision matrix

| Decision | Recommendation | Owner |
|---|---|---|
| Loader | `@playwright/test` + `launchPersistentContext` + `--load-extension=dist` | M |
| Storage seed | `serviceWorker.evaluate(...)` into `chrome.storage.local` | M |
| DeepL | Mocked via `route.fulfill`; no live calls in PR E2E | M |
| Specs in v1 | 3 automated: hover, selection-auto, missing-key | M |
| CI | On PRs to `main`, with Playwright browser cache and one retry | M |
| Shortcut command | Manual-smoke checklist; skip automated v1 | M |
