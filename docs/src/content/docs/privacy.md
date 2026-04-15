---
title: Privacy
description: Understand how Hover Translate handles your data.
---

# Privacy

Hover Translate sends only the text you hover to DeepL's servers. It does not collect analytics, does not track you, and does not send data anywhere else.

## What gets sent to DeepL

When you hover a supported text block, the extension prepares a normalized text payload and sends it to DeepL for translation.

- The payload is the hovered block's text, derived from `innerText` and normalized for whitespace.
- Requests are sent over HTTPS to `https://api-free.deepl.com/v2/translate`.
- Translation direction is set explicitly, for example `source_lang=JA` and `target_lang=EN-US`.
- DeepL's own privacy policy is available at [deepl.com/privacy](https://www.deepl.com/privacy).

DeepL states its own handling rules for API data. Review DeepL's official documentation and policy pages for the current wording that applies to your account and plan.

## Where your API key is stored

Your DeepL API key is stored locally in Chrome's extension storage.

- The key is saved in `chrome.storage.local`.
- It is stored in plaintext, which is a standard Chrome extension pattern but not encrypted storage.
- Anyone who can access the same Chrome profile may be able to access the saved key.
- If that is a concern, use a dedicated Chrome profile for Hover Translate.

## What data stays local

Several pieces of state never leave your browser except when translation or usage checks are requested.

- Extension settings such as `enabled`, `maxChars`, and `targetEnglish`
- The saved API key in `chrome.storage.local`
- The LRU translation cache, held only in service worker memory and cleared when the worker restarts
- Quota information fetched for the popup session, which is displayed in the UI and not stored permanently

## No telemetry

Hover Translate does not send:

- analytics events
- crash reports
- usage statistics
- tracking identifiers

The only external network requests are requests to the DeepL API.

## Permissions rationale

The extension asks for a small set of permissions, each for a specific reason.

- `storage`: save settings and the API key locally
- `activeTab`: identify the active tab when showing shortcut-triggered toast feedback
- `host_permissions: <all_urls>`: allow hover translation on normal pages across the web
- `host_permissions: https://api-free.deepl.com/*`: allow requests to the DeepL API

`<all_urls>` is required because the extension needs to run on whichever page you choose to read.

## Open source

The source code is public at [github.com/s-hiraoku/hover-translate](https://github.com/s-hiraoku/hover-translate).

Because the project is open source, anyone can inspect how data is stored, how requests are made, and which permissions are declared.
