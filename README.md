# Hover Translate

[![CI](https://github.com/s-hiraoku/hover-translate/actions/workflows/ci.yml/badge.svg)](https://github.com/s-hiraoku/hover-translate/actions/workflows/ci.yml)
[![Release](https://github.com/s-hiraoku/hover-translate/actions/workflows/release.yml/badge.svg)](https://github.com/s-hiraoku/hover-translate/actions/workflows/release.yml)

Chrome extension that translates hovered text blocks between English and Japanese.

## Features

- Toggle ON/OFF from the popup
- Hover over a paragraph, heading, list item, or other block element to translate it
- Automatic language detection — Japanese → English, everything else → Japanese
- Translations appear in a floating tooltip next to the hovered element

## Stack

- Vite + `@crxjs/vite-plugin`
- React 19 (popup UI)
- TypeScript (strict)
- Manifest V3

## Development

```sh
pnpm install
pnpm dev      # hot-reloading dev build in ./dist
pnpm build    # production build
pnpm zip      # build + zip for Chrome Web Store
```

Load `dist/` via `chrome://extensions` → "Load unpacked".

## Layout

```
src/
  manifest.ts              # MV3 manifest (crxjs)
  shared/messages.ts       # shared types between background/content/popup
  background/
    service-worker.ts      # MV3 service worker entry
    translator.ts          # translate() implementation
  content/
    index.ts               # hover detection + tooltip rendering
  popup/
    index.html
    main.tsx
    Popup.tsx
    popup.css
public/
  _locales/{en,ja}/messages.json
  icons/icon48.png
  icons/icon128.png
```

## Notes

- Translation is powered by the DeepL Free API. Users must supply their own key via the popup.
- Documentation site: [s-hiraoku.github.io/hover-translate](https://s-hiraoku.github.io/hover-translate/)

## Releasing a new version

1. Bump `version` in `package.json` and `src/manifest.ts`.
2. Update `CHANGELOG.md` with a new section. You can regenerate from Conventional Commits with [git-cliff](https://git-cliff.org/):
   ```sh
   git cliff --tag v1.0.2 --output CHANGELOG.md
   ```
3. Commit the version bump and changelog: `git commit -m "chore(release): v1.0.2"`.
4. Tag and push: `git tag v1.0.2 && git push origin main --tags`.
5. The Release workflow builds the extension, creates `hover-translate-v1.0.2.zip`, and attaches it to a new GitHub Release with the changelog notes.
6. Download the zip from the GitHub Release and upload to Chrome Web Store Developer Dashboard.
