# AGENTS.md（Codex などへの作業ルール）

このリポジトリは、**マイ単語帳**（ブラウザだけで動く静的ページ）です。説明は `README.md`、データの形式は `docs/data-format.md`。

## 直す場所
- 画面や動作を直すときは、**`src/app.html`** を直す。`index.html` は、生成物なので、直接は直さない。
- 保存・AI・ダウンロードの部分は、`src/shim.js`。設定の画面は、`src/settings.html`。
- 直したら、`python build.py` で `index.html` を作り直す。`PATCHES` の数が合わずに失敗したら、`build.py` の置き換え対象も、合わせて直す。
- 同期の SQL を変えたら、`supabase/setup.sql` と、README の手順も直す。

## 試し方
- `python tools/dev_server.py` → `http://localhost:8765/`
  - にせの Supabase：`http://localhost:8765/mock/supabase`、にせの OpenAI：`http://localhost:8765/mock/openai/v1`（キーは `test-key`）。
- 手での確認のリストは、README の「変更したときの確認」。
- 自動テストは、まだありません。足すなら、`tools/` に置く。

## 守ること
- **語のデータの形（`docs/data-format.md`）を、こわさない。** 項目を足すのは良い。名前や意味を変えるときは、取り込み（`src/shim.js` の `normalizeDoc`）と、古いバックアップが、読めるままにする。
- 画面の文は、日本語で、短く、やさしい言い方にする。
- ブラウザの `alert` `confirm` `prompt` は、アプリ本体（`src/app.html`）では使わない（設定の画面は、例外）。
- API キーや同期コードを、ファイルに書かない。コミットしない。
- `data/words-backup.json` は、利用者の本物のデータ。消さない。書き換えない。
- 画面の大きさ：パソコン（幅900px以上）で、「追加」と「復習」は、高さ600pxでも、スクロールなしで収まる。スマホ（幅360〜430px）で、横にはみ出さない。変えたら、両方で確かめる。
