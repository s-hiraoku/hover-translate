---
title: トラブルシューティング
description: セットアップや翻訳時のよくある問題を解決します。
---

# トラブルシューティング

このページでは、Hover Translate が表示する代表的なエラーメッセージと、その対処方法をまとめています。

## よくあるエラー

| メッセージ | コード | 考えられる原因 | 対処 |
| --- | --- | --- | --- |
| `Set your DeepL API key from the extension popup.` | `MISSING_KEY` | API キーが保存されていないか、保存値が空です。 | ポップアップを開き、**Setup** セクションで DeepL API キーを入力して **Save** を押してください。 |
| `Invalid DeepL API key. Check the key in the popup.` | `INVALID_KEY` / HTTP 403 | キーが間違っているか、無効化されています。 | DeepL アカウントでキーを確認し、コピー＆ペーストで再入力してください。 |
| `DeepL free quota exceeded this period.` | `QUOTA_EXCEEDED` / HTTP 456 | 月間の無料クォータを使い切っています。 | 次の請求サイクルまで待つか、将来サポートされる有料ワークフローを検討してください。**Max characters per request** を下げると消費を抑えられます。 |
| `DeepL rate limit hit. Slow down and try again.` | `RATE_LIMITED` / HTTP 429 | 短時間にリクエストを送りすぎています。 | 数秒待ってから再試行してください。Hover Translate は自動リトライしません。 |
| `DeepL is temporarily unavailable. Try again shortly.` | `SERVER_ERROR` / HTTP 5xx | DeepL 側で一時的な障害が発生しています。 | 数分後に再試行してください。 |
| `Network error reaching DeepL.` | `NETWORK_ERROR` | ネットワークに接続できないか、DeepL への接続が遮断されています。 | 接続を確認し、必要であれば別のネットワークで試してください。 |
| `Text too long (max X chars).` | `TEXT_TOO_LONG` | ホバーしたブロックが現在の文字数制限を超えています。 | **Max characters per request** を 5000 まで引き上げるか、より小さいブロックにホバーしてください。 |
| `Translation failed.` | `UNKNOWN` | 既知の分類に当てはまらない予期しないエラーです。 | Developer Tools で詳細を確認し、再現する場合は状況を添えて報告してください。 |

## メッセージ別の補足

### `Set your DeepL API key from the extension popup.`

- 原因: API キーがまだ保存されていない、または保存値が空です。
- 対処: ポップアップの **Setup** でキーを入力し、**Save** を押してください。

### `Invalid DeepL API key. Check the key in the popup.`

- 原因: キーが誤っている、期限切れ、または無効化されています。
- 対処: DeepL アカウント上の値を確認し、正確に貼り付け直してください。
- 注記: DeepL Free と DeepL Pro のキーは別です。Hover Translate は現在 Free プランのみを対象としています。

### `DeepL free quota exceeded this period.`

- 原因: 月 500,000 文字の無料枠を使い切っています。
- 対処: 次のサイクルまで待ってください。
- ヒント: **Limits** で **Max characters per request** を下げると、クォータの消費を抑えやすくなります。

### `DeepL rate limit hit. Slow down and try again.`

- 原因: ホバー操作が短時間に集中し、リクエストが多すぎました。
- 対処: 少し待ってから再度ホバーしてください。

### `DeepL is temporarily unavailable. Try again shortly.`

- 原因: DeepL 側の一時的な不安定状態や障害です。
- 対処: ローカル設定を変えず、時間をおいて再試行してください。

### `Network error reaching DeepL.`

- 原因: インターネット接続がない、DNS に問題がある、または `api-free.deepl.com` が管理ネットワークでブロックされています。
- 対処: 接続状態を確認し、必要であれば別のネットワークで試してください。

### `Text too long (max X chars).`

- 原因: クライアント側の文字数ガードレールにより、API 送信前に停止されました。
- 対処: **Limits** で上限を上げるか、より小さい段落・リスト項目・表セルにホバーしてください。

### `Translation failed.`

- 原因: 分類されていないエラー経路です。
- 対処: ブラウザコンソールや拡張機能ログを確認し、再現手順がある場合は GitHub Issue で共有してください。

## 最後に確認すること

まだ翻訳が表示されない場合は、次の点を確認してください。

- `chrome://extensions` で拡張機能が読み込まれ、有効になっているか
- ポップアップの **Translate** セクションで拡張機能が有効になっているか
- 開いているページが、`chrome://` や Chrome ウェブストアのような制限付きページではなく、通常の Web サイトであるか
