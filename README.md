# Hover Translate

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
  icons/icon48.png         # placeholder — replace before publishing
  icons/icon128.png        # placeholder — replace before publishing
```

## Notes

- `src/background/translator.ts` currently uses the unofficial `translate.googleapis.com` endpoint as a zero-key placeholder. Swap it for the Google Cloud Translation API (or DeepL, etc.) with a proper key before shipping.
- Icons under `public/icons/` are placeholders.
