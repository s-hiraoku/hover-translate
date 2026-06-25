---
title: プライバシー
description: Hover Translate がデータをどう扱うかを説明します。
---

# プライバシー

Hover Translate は Chrome built-in Translator API を使います。必要な言語パックが利用可能になった後、翻訳は Chrome 内でローカルに実行されます。

## 翻訳サービスへ送信されるもの

Hover Translate は、ホバーしたテキストを DeepL、Google Cloud Translation、Azure Translator、プロジェクト所有サーバーへ送信しません。

- content script がホバーしたブロックまたは選択テキストを整形します。
- そのテキストをブラウザ内の Chrome built-in Translator API に渡します。
- Chrome は、言語パックやモデル資産のダウンロードのために Google と通信する場合があります。
- 言語パックの準備後、プロジェクト側の API サーバーは不要です。

## API キーはありません

- DeepL キー入力欄はありません。
- クォータ token や課金情報は保存しません。
- `chrome.storage.local` には拡張機能の設定だけを保存します。

## ローカルに残るデータ

- `enabled`、`mode`、`selectionTrigger`、`maxChars` などの設定
- ページが開いている間の Translator API セッション
- 現在ページ上に表示されているツールチップ内容

## テレメトリなし

Hover Translate は analytics、クラッシュレポート、利用統計、トラッキング識別子を送信しません。

## 権限の理由

- `storage`: 拡張機能の設定を保存するため
- `activeTab`: 選択翻訳ショートカットを現在のタブへ送るため
- `host_permissions: <all_urls>`: 通常の Web ページでホバー翻訳を動かすため

`<all_urls>` は、ユーザーが読む任意のページ上で content script を実行するために必要です。
