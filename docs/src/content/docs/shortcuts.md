---
title: Shortcuts
description: Learn the keyboard shortcuts available in Hover Translate.
---

# Shortcuts

Hover Translate has one global keyboard shortcut, dedicated to the Selection mode.

## Default shortcut

The default shortcut is `Alt+Shift+T` on macOS, Windows, and Linux.

- It translates the **current text selection** when the extension is enabled and Mode is set to **Selection** with the **Shortcut** trigger.
- In Hover mode, or in Selection + Auto mode, the shortcut does nothing because those modes translate automatically.
- Holding a translation over the same text reuses the in-memory cache when available.

To use the shortcut:

1. Open the popup, save a DeepL API key, turn the extension on, and set Mode to **Selection** and Trigger to **Shortcut**.
2. On any supported page, highlight the text you want to translate.
3. Press `Alt+Shift+T`. A tooltip appears next to the selection with the translation.

## Where it works

The shortcut runs the extension's content script in the active tab, so it only works where the content script can inject.

- It works across regular HTTP and HTTPS sites that match the extension's host permissions.
- It does **not** work on restricted Chrome pages such as `chrome://` URLs, the Chrome Web Store, or the New Tab page.
- On those pages, pressing the shortcut has no effect.

## Customize the shortcut

1. Open `chrome://extensions/shortcuts`.
2. Find the Hover Translate entry named **Translate the current text selection**.
3. Use the shortcut editor to assign a different key combination.

You can also reach this page from the popup by clicking **Change** in the **Translate** section (shown only when Mode is Selection with the Shortcut trigger).

## Avoid shortcut conflicts

Before saving a new shortcut, make sure it does not overlap with:

- Chrome's built-in keyboard shortcuts
- Operating system shortcuts
- Other extensions that already use the same key combination

If two shortcuts conflict, Chrome may prevent the assignment or the result may be inconsistent across tabs.
