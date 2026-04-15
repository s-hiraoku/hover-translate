# Store Listing (English)

## Name
Hover Translate: English ⇄ Japanese

## Short description (132 chars max)
Hover over English or Japanese paragraphs to translate them with your own DeepL Free API key.

## Detailed description (16,000 chars max)
## Why Hover Translate?

Hover Translate is a Chrome extension for reading English and Japanese webpages with less interruption. Instead of copying text into another app or opening a full-page translator, you can hover over a paragraph and read the translated result in a tooltip next to the original content.

The extension is intentionally narrow in scope. It translates paragraph-level text between English and Japanese only, uses the user's own DeepL Free API key, and keeps the interface small: a popup for setup and limits, a floating tooltip for results, and one keyboard shortcut for quick ON/OFF control.

This extension is designed for people who read documentation, articles, blogs, or bilingual reference material and want a lightweight translation tool that stays out of the way.

## Features

- Hover over a paragraph, list item, heading, table cell, or similar block element to translate it in place
- Automatically detects English or Japanese and chooses the translation direction
- Uses DeepL Free for translation quality
- Shows results in a floating tooltip after a 300 ms hover delay
- Displays translation errors in a visually distinct tooltip with a red border
- Includes a popup with four sections: Setup, Translate, Quota, and Limits
- Shows current DeepL usage in the popup, including warning and danger states
- Lets you customize the maximum characters per request from 500 to 5000
- Avoids repeated translation of the same text with an in-memory 100-entry LRU cache
- Supports a global keyboard shortcut to toggle translation on and off

## How it works

1. Open the extension popup and save your DeepL Free API key.
2. Turn translation on in the popup.
3. Visit any webpage with English or Japanese text.
4. Hover over a paragraph-sized text block and read the translated result in the tooltip.

## Your own DeepL Free API key required

Hover Translate does not ship with a shared translation account. You must create your own DeepL API Free account and paste your own API key into the extension popup before translation will work.

DeepL API Free currently includes up to 500,000 characters per month at no cost. The extension also includes a quota display and a configurable character limit so you can manage usage directly from the popup.

## Privacy

Hovered text is sent only to the DeepL Free API for translation. No analytics, tracking, crash reporting, or unrelated telemetry is included.

Your DeepL API key is stored locally in `chrome.storage.local`. The extension does not send your key anywhere except DeepL when making authenticated API requests on your behalf.

## Keyboard shortcut

The default shortcut is `Alt+Shift+T`. It toggles translation ON/OFF from the current tab and shows a small status toast. You can change the shortcut from Chrome's extension shortcut settings.

## Documentation

Full guide: https://s-hiraoku.github.io/hover-translate/

Source code: https://github.com/s-hiraoku/hover-translate

## Category
Productivity

## Language
English
