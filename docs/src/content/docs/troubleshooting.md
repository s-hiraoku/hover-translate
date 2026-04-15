---
title: Troubleshooting
description: Fix common setup and translation issues.
---

# Troubleshooting

This page lists the error messages Hover Translate can show and the most direct fix for each one.

## Common errors

| Message | Code | Likely cause | What to do |
| --- | --- | --- | --- |
| `Set your DeepL API key from the extension popup.` | `MISSING_KEY` | No API key has been saved, or the saved value is empty. | Open the popup, go to **Setup**, paste your DeepL key, and click **Save**. |
| `Invalid DeepL API key. Check the key in the popup.` | `INVALID_KEY` / HTTP 403 | The key is incorrect or has been disabled. | Verify the key in your DeepL account, then copy and paste it again carefully. |
| `DeepL free quota exceeded this period.` | `QUOTA_EXCEEDED` / HTTP 456 | The monthly free quota has been used up. | Wait for the next billing cycle or move to a supported paid workflow in the future. Lowering **Max characters per request** can slow quota usage. |
| `DeepL rate limit hit. Slow down and try again.` | `RATE_LIMITED` / HTTP 429 | Too many requests were sent in a short time. | Wait a few seconds and try again. Hover Translate does not retry automatically. |
| `DeepL is temporarily unavailable. Try again shortly.` | `SERVER_ERROR` / HTTP 5xx | DeepL is temporarily unavailable. | Retry after a few minutes. |
| `Network error reaching DeepL.` | `NETWORK_ERROR` | Your network is offline or access to DeepL is blocked. | Check connectivity, then try another network if your current environment blocks DeepL. |
| `Text too long (max X chars).` | `TEXT_TOO_LONG` | The hovered block exceeds your configured character limit. | Increase **Max characters per request** up to 5000 or hover a smaller block. |
| `Translation failed.` | `UNKNOWN` | An unexpected error occurred outside the known categories. | Open Developer Tools for details and report the issue with the error context if it persists. |

## Message-specific notes

### `Set your DeepL API key from the extension popup.`

- Cause: the API key has not been stored yet, or the stored value is blank.
- Fix: open the popup and enter the key in **Setup**, then click **Save**.

### `Invalid DeepL API key. Check the key in the popup.`

- Cause: the key is wrong, expired, or disabled.
- Fix: confirm the value in your DeepL account and paste it again exactly as issued.
- Note: DeepL Free and DeepL Pro keys are different. Hover Translate currently supports the Free plan only.

### `DeepL free quota exceeded this period.`

- Cause: the 500,000-character monthly free allowance has been exhausted.
- Fix: wait for the next cycle.
- Tip: reduce **Max characters per request** in **Limits** to conserve quota on large pages.

### `DeepL rate limit hit. Slow down and try again.`

- Cause: repeated hover actions triggered too many requests in a short interval.
- Fix: pause briefly before hovering again.

### `DeepL is temporarily unavailable. Try again shortly.`

- Cause: a temporary DeepL-side outage or instability.
- Fix: retry later without changing local settings.

### `Network error reaching DeepL.`

- Cause: no internet connection, DNS problems, or a managed network blocking `api-free.deepl.com`.
- Fix: confirm the connection and try another network if needed.

### `Text too long (max X chars).`

- Cause: the client-side character guardrail stopped the request before it reached DeepL.
- Fix: raise the limit in **Limits** or hover a smaller paragraph, list item, or table cell.

### `Translation failed.`

- Cause: a non-classified error path.
- Fix: inspect the browser console and extension logs, then file a GitHub issue if you can reproduce it.

## Final checks

If you still do not see translations, verify the following:

- The extension is present and enabled in `chrome://extensions`.
- The popup's **Translate** section shows the extension as active.
- The page is a normal website rather than a restricted Chrome page such as `chrome://` or the Chrome Web Store.
