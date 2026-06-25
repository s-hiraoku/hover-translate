# Chrome Web Store Justifications

## Single purpose description

Hover Translate translates hovered or selected paragraph-level text between English and Japanese directly on webpages. It uses Chrome's built-in Translator API for in-place reading assistance rather than full-page translation or unrelated browsing features.

## Permission justifications

### `storage`

Stores extension settings, including ON/OFF state, mode, selection trigger, and maximum characters per request, in `chrome.storage.local` so they persist across browser sessions.

### `activeTab`

Used to identify the active tab when routing the selection translation shortcut. The extension does not use this permission to read tab content outside the user's translation action.

## Host permission justifications

### `<all_urls>`

The extension needs to inject its hover-detection content script into webpages the user visits, because translation is intended to work on any site the user reads, such as documentation, articles, or blogs. The content script reacts only when the user hovers over text or explicitly selects text for translation.

## Remote code usage

No. All JavaScript is bundled and shipped with the extension package. The extension does not fetch executable code remotely.

## Data usage

- Personally identifiable information: No
- Health information: No
- Financial and payment information: No
- Authentication information: No
- Personal communications: No
  - If a user hovers over or selects personal content, that text is passed to Chrome's built-in Translator API in the browser.
- Location: No
- Web history: No
- User activity: No
- Website content: Yes
  - The text the user explicitly hovers over or selects is processed for translation; no other page content is collected.

## Data handling certification

- I do not sell or transfer user data to third parties, outside of the approved use cases: Yes
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose: Yes
- I do not use or transfer user data to determine creditworthiness or for lending purposes: Yes
