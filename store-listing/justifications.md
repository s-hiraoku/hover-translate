# Chrome Web Store Justifications

## Single purpose description

Hover Translate translates hovered paragraph-level text between English and Japanese directly on webpages, using the user's own DeepL Free API key. It is designed for in-place reading assistance rather than full-page translation or unrelated browsing features.

## Permission justifications

### `storage`

Stores the user's DeepL API key and extension settings, including the ON/OFF state and maximum characters per request, in `chrome.storage.local` so they persist across browser sessions.

### `activeTab`

Used only to show a small ON/OFF status toast in the currently active tab when the user triggers the keyboard shortcut. The extension does not use this permission to read tab content.

## Host permission justifications

### `<all_urls>`

The extension needs to inject its hover-detection content script into webpages the user visits, because translation is intended to work on any site the user reads, such as documentation, articles, or blogs. The content script reacts only when the user explicitly hovers over text and does not transmit page content automatically.

### `https://api-free.deepl.com/*`

This host permission is required so the service worker can send requests to the DeepL Free API endpoints used by the extension, including `/v2/translate` and `/v2/usage`. This is the only external network destination contacted by the extension.

## Remote code usage

No. All JavaScript is bundled and shipped with the extension package. The only external network activity is requesting JSON responses from the DeepL API for translation and usage information, and no executable code is fetched remotely.

## Data usage

- Personally identifiable information: No
- Health information: No
- Financial and payment information: No
- Authentication information: Yes
  - DeepL API key, stored locally, and sent only to DeepL as part of authenticated API requests
- Personal communications: No
  - If a user hovers over content they consider personal, that hovered text may be sent to DeepL for translation
- Location: No
- Web history: No
- User activity: No
- Website content: Yes
  - The text the user explicitly hovers over is sent to DeepL for translation; no other page content is collected

## Data handling certification

- I do not sell or transfer user data to third parties, outside of the approved use cases: Yes
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose: Yes
- I do not use or transfer user data to determine creditworthiness or for lending purposes: Yes
