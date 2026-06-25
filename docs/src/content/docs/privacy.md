---
title: Privacy
description: Understand how Hover Translate handles your data.
---

# Privacy

Hover Translate uses Chrome's built-in Translator API. Translation runs locally in Chrome after the required language packs are available.

## What gets sent to translation services

Hover Translate does not send hovered text to DeepL, Google Cloud Translation, Azure Translator, or any project-owned server.

- The content script normalizes the hovered block or selected text.
- It passes that text to Chrome's built-in Translator API in the browser.
- Chrome may contact Google only to download language packs or model assets managed by the browser.
- After the language packs are installed, translation does not require a project API server.

## No API key

Hover Translate no longer stores a translation API key.

- There is no DeepL key field.
- There is no quota token or billing credential.
- `chrome.storage.local` stores only extension settings.

## What data stays local

- Extension settings such as `enabled`, `mode`, `selectionTrigger`, and `maxChars`
- Translator API sessions held by the content script while the page is loaded
- Tooltip content shown on the current page

## No telemetry

Hover Translate does not send:

- analytics events
- crash reports
- usage statistics
- tracking identifiers

## Permissions rationale

- `storage`: save extension settings locally
- `activeTab`: identify the active tab when routing the selection shortcut
- `host_permissions: <all_urls>`: allow hover translation on normal pages across the web

`<all_urls>` is required because the extension needs to run on whichever page you choose to read.

## Open source

The source code is public at [github.com/s-hiraoku/hover-translate](https://github.com/s-hiraoku/hover-translate).
