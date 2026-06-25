# Store Listing (Japanese)

## Name
Hover Translate: 英語 ⇄ 日本語

## Short description
英語・日本語の段落にホバーすると、Chrome built-in 翻訳でローカルに翻訳します。

## Detailed description
## Hover Translate について

Hover Translate は、英語と日本語の Web ページを少ない操作で読むための Chrome 拡張機能です。別アプリにコピーしたりページ全体を翻訳したりせず、段落にホバーするだけで元テキストの近くに翻訳を表示します。

翻訳エンジンには Chrome built-in Translator API を使います。DeepL などの外部翻訳 API キーは不要です。

## 主な機能

- 段落、リスト項目、見出し、表セルなどにホバーしてその場で翻訳
- 選択したテキストをショートカットまたはマウスを離したタイミングで翻訳
- 英語・日本語を自動判定
- Chrome built-in 翻訳を利用し、翻訳 API キー不要
- 300ms の hover delay 後にツールチップ表示
- エラー時は赤い罫線付きツールチップで表示
- 1 回あたりの最大文字数を 500 から 5000 で設定可能
- ページ表示中は Translator API セッションを再利用

## 使い方

1. ポップアップを開き、必要なら言語パックを準備します。
2. ポップアップで翻訳を ON にします。
3. 英語または日本語のある Web ページを開きます。
4. 段落にホバーするか、選択テキストを翻訳します。

## プライバシー

ホバーまたは選択したテキストは Chrome built-in Translator API に渡されます。Hover Translate はプロジェクト側サーバーへ翻訳テキストを送信せず、翻訳 API キーも保存しません。

アナリティクス、トラッキング、クラッシュレポートなどの不要なテレメトリは含まれていません。

## ショートカット

既定のショートカットは `Alt+Shift+T` です。Selection mode が Shortcut のとき、現在の選択範囲を翻訳します。Chrome の拡張機能ショートカット設定から変更できます。
