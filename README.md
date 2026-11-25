# マイ単語帳

TOEIC 用の、自分だけの単語帳です。分からなかった英単語を入れると、AI が意味・発音記号・例文・派生語などを付けて、単語帳にします。
復習は「わかる／わからない」を押す方式で、一周するまで同じ語は出ません。

もともとは claude.ai の「アーティファクト」として作りました。このフォルダーは、**claude.ai がなくても動く版**です。
ブラウザだけで動く、静的なページ（`index.html` 1枚）です。サーバーは要りません。

**公開ページ**：https://tomokaki14-dotcom.github.io/my-tango/　（スマホは、このアドレスを開いて、「ホーム画面に追加」）
**リポジトリ**：https://github.com/tomokaki14-dotcom/my-tango

## 目次
1. [フォルダーの中身](#フォルダーの中身)
2. [最初にやること：データを移す](#最初にやることデータを移す)
3. [使えるようにする（公開）](#使えるようにする公開)
4. [AI の自動作成（OpenAI）](#ai-の自動作成openai)
5. [PC とスマホの同期（Supabase）](#pc-とスマホの同期supabase)
6. [作り（Codex など、直す人向け）](#作りcodex-など直す人向け)
7. [できないこと・注意](#できないこと注意)

## フォルダーの中身
| 場所 | 内容 |
|---|---|
| `index.html` | **完成したページ**（これを公開する）。`build.py` が作ります。直接は直しません |
| `src/app.html` | アプリ本体（画面と動作のすべて）。**直すのは、ここ** |
| `src/shim.js` | claude.ai の機能の代わり（保存・AI・ダウンロード） |
| `src/settings.html` | 「設定」の画面（バックアップ、AI のキー、同期） |
| `build.py` | `src/` から `index.html` を作る |
| `supabase/setup.sql` | 同期に使う、Supabase の設定（SQL） |
| `data/words-backup.json` | **claude.ai に保存してあった語（149語）のバックアップ** |
| `docs/codex-handoff.md` | **Codex への引き継ぎ**（最初に読む） |
| `docs/data-format.md` | 語のデータの形式 |
| `docs/wordbank_spec.md` | もとの TOEIC 単語帳（3,141語）の仕様 |
| `tools/dev_server.py` | 試験用のサーバー（AI と同期の「にせもの」付き） |
| `AGENTS.md` | Codex などへの作業ルール |

## 最初にやること：データを移す
1. `index.html` をブラウザで開く。または、公開したページを開く。
2. 右上の「⚙ 設定」を押す。
3. 「ファイルから読み込む」で、`data/words-backup.json` を選ぶ。
4. 「追加 149語」と出れば、完了です。意味、例文、派生語、登録元（でる1000・金フレ・公式問題集）、間違いの記録も、そのまま戻ります。

語は、**このブラウザの中**に保存されます。ブラウザのデータを消すと、語も消えます。「設定」の「すべて保存（JSON）」で、ときどきバックアップを取ってください。

## 使えるようにする（公開）
### いちばん簡単：GitHub Pages（無料）
スマホのホーム画面にも置けます。語のデータは、各自のブラウザの中にあるので、公開しても、語は見えません。
```bash
cd このフォルダー
git init
git add .
git commit -m "マイ単語帳"
gh repo create my-tango --public --source=. --push
# GitHub のリポジトリで Settings → Pages → Branch: main / (root) → Save
```
数分後に、`https://<あなたの名前>.github.io/my-tango/` で開けます。

スマホでは、そのアドレスを Safari で開き、共有ボタン →「ホーム画面に追加」で、アプリのように置けます。

### ほかの方法
`index.html` は、どこに置いても動きます（Cloudflare Pages、Netlify、自分のサーバーなど）。

## AI の自動作成（OpenAI）
語を入れて「単語帳にする」を押すと、AI が内容を作る機能です。**なくても、ほかの機能はすべて動きます。**

1. OpenAI の [API キー](https://platform.openai.com/api-keys)を作る（ChatGPT や Codex の契約とは別の、API の課金です）。
2. 「設定」→「AI で自動作成」に、キーを入れる。「試す」で確認して、「保存して再読み込み」。
3. モデルは、`gpt-4.1-mini` が最初の値です。変えたいときは、「モデル」の欄に、使いたいモデル名を入れます。

- キーは、**その端末のブラウザの中だけ**に保存されます。サーバーには送りません。
- 料金は、使った分だけです。1語あたりは、ごくわずかです（目安：小さいモデルなら、数十語で、数円〜十数円）。正確な料金は、OpenAI の料金表で確かめてください。
- OpenAI 互換の API（`/chat/completions` の形式）なら、「API の場所」を変えて、使えます。
- AI に頼む文章（プロンプト）は、`src/app.html` の `buildPrompt`、`DERIVED_RULE`、`SENSE_RULE`、`sensePrompt`、`dvPrompt` にあります。


### 無料で使う（Google Gemini / Groq）
「設定」→「AI で自動作成」で、「サービス」に、「Google Gemini」か「Groq」を選ぶと、API の場所が、自動で入ります。キーは、それぞれの無料の画面（Google AI Studio、Groq Console）で作れます。「使えるモデルを調べる」で、使えるモデルの名前を、選べます。無料の枠には、回数の上限があります。通信の窓口は、このページから、呼び出せることを確かめましたが、実際のキーでの作成は、試していません。

### AI を使わずに、Codex に語を作ってもらう方法
0. いちばん簡単：「設定」→「データ」の「**AI に頼む文章をコピー**」を押し、無料の ChatGPT・Claude・Gemini のチャットに貼る。その下に、語を、1行に1語、書いて送る。返ってきた JSON を、次の3. の欄に貼る。（この文章は `src/ai-prompt.txt` にあります）
1. Codex に、「次の英単語を、`docs/data-format.md` の形式の JSON にして」と頼む。語の一覧を渡す。
2. 出てきた JSON を、「設定」の「JSON を貼り付けて取り込む」に貼る。
3. `word` だけでも取り込めます。足りない項目は、空になります。

## PC とスマホの同期（Supabase）
PC とスマホで、同じ単語帳にする機能です。無料の枠で足ります。**使わなくても、動きます**（その場合は、端末ごとに別々の単語帳になります）。

### 準備（最初に1回）
1. [Supabase](https://supabase.com) に登録して、新しいプロジェクトを作る（無料）。
2. 左のメニューの「SQL Editor」を開く。`supabase/setup.sql` の中身を、全部貼り付けて「Run」。
   （同じ SQL は、アプリの「設定」の中の「Supabase で最初に1回だけ実行する SQL」にもあります）
3. 「Project Settings」→「API」を開き、次の2つを控える。
   - **Project URL**（`https://xxxx.supabase.co`）
   - **公開用のキー**：`anon public`（eyJ…で始まる）、または`Publishable key`（sb_publishable_…で始まる）。どちらでも使えます。**秘密のキー（service_role、Secret key）は、絶対に入れない。**

### アプリに入れる（PC とスマホの両方で）
1. 「設定」→「PC とスマホの同期」に、URL と anon キーを入れる。
2. 「同期コードを作る」を押す（PC で1回だけ）。**このコードを、控える**。スマホには、同じコードを入れる。
3. 「接続を試す」→「保存して再読み込み」。

最初につないだ端末は、その端末にある語を、サーバーに送ります。2台目からは、サーバーの語を受け取ります。

### 安全について
- 同期コードは、**パスワードと同じ**です。人に見せない。GitHub に載せない。長いものにする（16文字以上が必須。自動で作られるのは24文字）。
- テーブルには、直接さわれません。アプリは、`setup.sql` の3つの関数だけを、同期コードつきで呼びます。
- anon キーは、公開されても構わない種類のキーです。

## 作り（Codex など、直す人向け）
- 画面と動作は、すべて `src/app.html` の中にあります（HTML、CSS、JavaScript が1ファイル）。
- もとは claude.ai のアーティファクトなので、アプリは `window.claude.use(name)` で、次の3つの部品を受け取ります。
  - `db`：`collection('words').onSnapshot(cb, errCb)`、`doc('words/<id>').set(obj)`、`.delete()`
  - `sample`：`sample.json(prompt, {signal})` → 解析した JSON。失敗は `{code, message}` で reject
  - `downloads`：`save({filename, data})`
- `src/shim.js` が、この3つを、ふつうの Web の仕組みで作ります。
  - `db`：`localStorage`。同期を設定すると、Supabase にも書く。20秒ごと、画面に戻ったとき、回線が戻ったときに、サーバーの内容を取り込む。送れなかった変更は、あとで再送する
  - `sample`：OpenAI の Chat Completions
  - `downloads`：Blob と `<a download>`
- `build.py` が、`src/app.html` に、いくつかの文言の置き換え（`PATCHES`）をして、`index.html` を作ります。置き換えの数が合わないと、ビルドが失敗します。
- 作り直す：`python build.py`
- 試す：`python tools/dev_server.py` → `http://localhost:8765/`
  - 「設定」で、同期の URL に `http://localhost:8765/mock/supabase`、API の場所に `http://localhost:8765/mock/openai/v1`、キーに `test-key` を入れると、アカウントなしで、同期と AI の動きを試せます。
- 保存の形式は、`docs/data-format.md` にあります。

### 変更したときの確認（手で）
1. 追加：語を入れて登録できる。多義語（例 `address`）は、意味の選択が出る。重複はエラーになる。
2. 単語帳：絞り込み、編集、削除（2回押し）、まとめて選ぶ、登録元の付け外し。
3. 復習：長押しで答えが出る。ボタンの外で離すと取り消し。一周で終わる。「わかる」で間違いから外れる。
4. 間違い：一覧、「確認した」。
5. 画面の高さ600pxで、追加と復習がスクロールなしで収まる（パソコン）。スマホで横にはみ出さない。
6. 設定：バックアップの保存と読み込み。

## できないこと・注意
- 同期の変更は、20秒ほどで、ほかの端末に届きます（すぐには反映されません）。同じ語を、2台で同時に直すと、あとから保存したほうが残ります。
- 同期は、**Supabase の実物では、まだ試していません**（作った環境では、にせもの（`tools/dev_server.py`）で、書き込み、削除、取り込み、オフライン時の再送を確かめました）。SQL を実行したあと、「接続を試す」で、つながるかを確かめてください。
- 保存先のブラウザの `localStorage` には、5MB ほどの上限があります。語が数千になると、足りなくなる場合があります。
- 読み上げは、端末の音声を使います。声の種類は、端末とブラウザで違います。「復習」の「発音の声」で、選べます。
- API キーは、その端末のブラウザの中にあります。ほかの人が使う端末には、入れないでください。
- claude.ai 版（アーティファクト）の最後の版は、`src/app.html` と同じ内容です。
