---
title: Shortcuts
description: Learn the keyboard shortcuts available in Hover Translate.
---

# Shortcuts

Hover Translate includes one global shortcut so you can enable or disable hover translation without opening the popup.

## Default shortcut

The default shortcut is `Alt+Shift+T` on macOS, Windows, and Linux.

- It toggles the extension between ON and OFF.
- After each toggle, the active tab shows a toast near the top-right corner for about 1.2 seconds.
- The toast confirms the new state: `Hover Translate: ON` or `Hover Translate: OFF`.

## Where it works

The shortcut is meant for normal web pages where the extension can run its content script.

- It works across regular sites that match the extension's host permissions.
- It does not fully operate on restricted pages such as `chrome://` URLs or the Chrome Web Store.
- On those pages, the content script is not injected, so the translation UI and toast feedback do not appear.

## Customize the shortcut

1. Open `chrome://extensions/shortcuts`.
2. Find the Hover Translate entry named **Toggle hover translation on/off**.
3. Use the shortcut editor to assign a different key combination.

You can also reach this page from the popup by clicking **Change** in the **Translate** section.

## Avoid shortcut conflicts

Before saving a new shortcut, make sure it does not overlap with:

- Chrome's built-in keyboard shortcuts
- Operating system shortcuts
- Other extensions that already use the same key combination

If two shortcuts conflict, Chrome may prevent the assignment or the result may be inconsistent across tabs.
