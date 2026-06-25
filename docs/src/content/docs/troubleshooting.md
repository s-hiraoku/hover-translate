---
title: Troubleshooting
description: Fix common setup and translation issues.
---

# Troubleshooting

This page lists the messages Hover Translate can show and the most direct fix for each one.

## Common errors

| Message | Code | Likely cause | What to do |
| --- | --- | --- | --- |
| `Chrome built-in translation is unavailable in this browser. Use desktop Chrome 138 or later.` | `TRANSLATOR_UNSUPPORTED` | The browser does not expose the built-in Translator API. | Use desktop Chrome 138 or later. Mobile Chrome, Firefox, and Safari are not supported. |
| `English-Japanese translation is unavailable on this device.` | `LANGUAGE_PACK_UNAVAILABLE` | Chrome reports that the requested language pair cannot be used. | Update Chrome and confirm built-in AI features are available for your profile and device. |
| `Language pack download needs a click. Open the popup and press Prepare.` | `LANGUAGE_PACK_DOWNLOAD_REQUIRED` | Chrome needs user activation before downloading language packs. | Open the popup and press **Prepare** in the **Engine** section. |
| `Text too long (max X chars).` | `TEXT_TOO_LONG` | The hovered block exceeds your configured character limit. | Increase **Max characters per request** up to 5000 or hover a smaller block. |
| `Translation failed.` | `UNKNOWN` | An unexpected Translator API error occurred. | Reload the page and try again. If it persists, check the browser console and file an issue. |

## Final checks

If you still do not see translations, verify the following:

- The extension is present and enabled in `chrome://extensions`.
- The popup's **Engine** section shows `Ready for English ⇄ Japanese`.
- The popup's **Translate** section shows the extension as active.
- The page is a normal website rather than a restricted Chrome page such as `chrome://` or the Chrome Web Store.
- Chrome has enough disk space to download and keep language packs.
