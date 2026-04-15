---
title: プライバシー
description: Hover Translate がデータをどのように扱うかを説明します。
---

# プライバシー

Hover Translate は、ホバーしたテキストだけを DeepL のサーバーに送信します。アナリティクスの収集、トラッキング、その他の外部送信は行いません。

## DeepL に送信される情報

対応するテキストブロックにホバーすると、拡張機能は翻訳に必要なテキストを整形して DeepL に送信します。

- 送信されるのは、`innerText` をもとに空白を正規化したホバー対象ブロックのテキストです。
- リクエストは `https://api-free.deepl.com/v2/translate` に HTTPS POST で送られます。
- 翻訳方向は `source_lang=JA` と `target_lang=EN-US` のように明示的に指定されます。
- DeepL 側のプライバシーポリシーは [deepl.com/privacy](https://www.deepl.com/privacy) を参照してください。

DeepL における API データの扱いは DeepL 自身が定めています。適用される最新の説明については、DeepL の公式ドキュメントとポリシーを確認してください。

## API キーの保存場所

DeepL API キーは、Chrome の拡張機能用ローカルストレージに保存されます。

- 保存先は `chrome.storage.local` です。
- 保存形式は平文であり、Chrome 拡張機能では一般的な方式ですが、暗号化はされません。
- 同じ Chrome プロファイルにアクセスできる人は、保存済みのキーを参照できる可能性があります。
- それが懸念される場合は、Hover Translate 専用の Chrome プロファイルを使うことを推奨します。

## ローカルに留まる情報

翻訳や利用量確認のために必要な通信を除き、次の情報はブラウザ内に留まります。

- `enabled`、`maxChars`、`targetEnglish` などの設定値
- `chrome.storage.local` に保存された API キー
- Service Worker のメモリ上にのみ存在し、再起動で消える LRU 翻訳キャッシュ
- ポップアップ表示のために取得したクォータ情報。UI 上には保持されますが、永続保存はされません

## テレメトリなし

Hover Translate は次の情報を送信しません。

- アナリティクスイベント
- クラッシュレポート
- 利用統計
- トラッキング識別子

外部への通信先は DeepL API のみです。

## 権限が必要な理由

拡張機能は最小限の権限だけを要求し、それぞれに用途があります。

- `storage`: 設定と API キーをローカルに保存するため
- `activeTab`: ショートカット操作時に、トースト表示対象のアクティブタブを特定するため
- `host_permissions: <all_urls>`: 通常のさまざまなページ上でホバー翻訳を動作させるため
- `host_permissions: https://api-free.deepl.com/*`: DeepL API へのリクエストを許可するため

`<all_urls>` が必要なのは、ユーザーがどのページを読んでいても拡張機能を動作させるためです。

## オープンソース

ソースコードは [github.com/s-hiraoku/hover-translate](https://github.com/s-hiraoku/hover-translate) で公開されています。

オープンソースであるため、保存されるデータ、送信されるリクエスト、宣言されている権限を誰でも確認できます。
