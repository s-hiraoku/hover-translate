---
title: トラブルシューティング
description: よくある設定・翻訳の問題を解決します。
---

# トラブルシューティング

## よくあるエラー

| Message | Code | 主な原因 | 対処 |
| --- | --- | --- | --- |
| `Chrome built-in translation is unavailable in this browser. Use desktop Chrome 138 or later.` | `TRANSLATOR_UNSUPPORTED` | Translator API が利用できないブラウザです。 | デスクトップ版 Chrome 138 以降を使ってください。 |
| `English-Japanese translation is unavailable on this device.` | `LANGUAGE_PACK_UNAVAILABLE` | Chrome が英語⇄日本語を利用不可と返しています。 | Chrome を更新し、使用中の profile/device で built-in AI 機能が利用できるか確認してください。 |
| `Language pack download needs a click. Open the popup and press Prepare.` | `LANGUAGE_PACK_DOWNLOAD_REQUIRED` | 言語パックのダウンロード開始にユーザー操作が必要です。 | ポップアップを開き、**Engine** の **Prepare** を押してください。 |
| `Text too long (max X chars).` | `TEXT_TOO_LONG` | 翻訳対象が設定上限を超えています。 | **Max characters per request** を最大 5000 まで上げるか、短い範囲を選んでください。 |
| `Translation failed.` | `UNKNOWN` | 想定外の Translator API エラーです。 | ページを再読み込みして再試行し、再現する場合は issue を作成してください。 |

## 最終確認

- `chrome://extensions` で拡張機能が有効になっている。
- ポップアップの **Engine** が `Ready for English ⇄ Japanese` になっている。
- **Translate** が Active になっている。
- `chrome://` や Chrome Web Store ではなく通常の Web ページで試している。
- Chrome が言語パックを保存できるだけの空き容量がある。
