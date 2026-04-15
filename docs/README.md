# Hover Translate — User Documentation

Astro Starlight site for the [Hover Translate](https://github.com/s-hiraoku/hover-translate) Chrome extension.

## Development

```sh
pnpm install
pnpm dev      # local dev server at http://localhost:4321/hover-translate/
pnpm build    # static build -> ./dist
pnpm preview  # serve the built site
```

## Deployment

This site is published to GitHub Pages via the `.github/workflows/deploy-docs.yml` workflow. Any push to `main` that touches `docs/**` triggers an automatic build and publish to the `gh-pages` branch.

Live site: https://s-hiraoku.github.io/hover-translate/

## Structure

```text
docs/
├── src/
│   ├── assets/screenshots/   # popup screenshots shown in the guide
│   ├── content/
│   │   └── docs/
│   │       ├── *.{md,mdx}    # English pages (default locale)
│   │       └── ja/*.{md,mdx} # Japanese pages
│   ├── styles/custom.css     # theme override matching the extension popup
│   └── content.config.ts
├── public/favicon.svg
├── astro.config.mjs
└── package.json
```
