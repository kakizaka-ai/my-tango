#!/usr/bin/env python3
"""Builds index.html (a single static file) from the pieces in src/.

    python build.py

  src/app.html       the app, exactly as it runs inside the claude.ai artifact
  src/shim.js        window.claude.use('db' | 'sample' | 'downloads') on ordinary web APIs
  src/settings.html  the 設定 dialog (backup/import, AI key, sync)
  supabase/setup.sql shown inside the 設定 dialog so it can be copied from there

The only changes made to app.html are the PATCHES below: wording that named Claude, the storage note, and the 設定 button.
Each patch must match exactly the stated number of times, so a change in app.html that breaks one fails the build loudly.
"""
import io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
rd = lambda *p: io.open(os.path.join(HERE, *p), encoding="utf-8").read()

app = rd("src", "app.html")

PATCHES = [  # (old, new, expected count)
    ('<meta name="claude:viewport-fit-sides" content="cover">\n', '', 1),
    ('最初の1回だけ、Claude の利用を許可するかどうかを聞かれます。利用量は、あなたのアカウントから使われます。',
     '自動作成には、OpenAI の API を使います（右上の「設定」でキーを入れてください）。利用料は、あなたの API アカウントにかかります。', 1),
    ('Claude が調べます', 'AI が調べます', 2),
    ("この画面では、Claude による自動作成が使えません。claude.ai か Claude アプリで、このページを開いてください（ホーム画面のアイコンから開いた場合は、アプリで開き直してください）。",
     'この環境では、自動作成が使えません。', 1),
    ("Claude の利用が許可されませんでした。ページを開き直して、許可してください。",
     'API キーが正しくないか、使えません。「設定」で、キーを確かめてください。', 1),
    ("このアカウントでは、Claude による自動作成が使えません。", 'この環境では、自動作成が使えません。', 1),
    ("    if (c === 'cancelled') return '中止しました。';\n",
     "    if (c === 'cancelled') return '中止しました。';\n"
     "    if (c === 'no_key') return '自動作成には、「設定」で OpenAI の API キーを入れてください。';\n", 1),
    ('ask Claude once', 'ask the AI once', 1),
    ("$('modeNote').textContent = S.mode === 'db' ? '保存先：クラウド（PC とスマホで同じ単語帳になります）' : '保存先：この端末の中だけ（ほかの端末とは同期しません）';",
     "$('modeNote').textContent = (window.__storeInfo && window.__storeInfo.note()) || (S.mode === 'db' ? '保存先：クラウド' : '保存先：この端末の中だけ');", 1),
    ('<p class="hint" id="modeNote"></p>',
     '<p class="hint" id="modeNote"></p>\n    <button type="button" class="gear" id="setBtn">⚙ 設定</button>', 1),
]
for old, new, n in PATCHES:
    got = app.count(old)
    if got != n:
        sys.exit("patch failed (%d matches, expected %d): %r" % (got, n, old[:70]))
    app = app.replace(old, new)

# the artifact page is a fragment (title, styles, <main>, <script>); wrap it in a real document
i = app.index("<main")
head_part, body_part = app[:i], app[i:]
j = body_part.index("</main>") + len("</main>")
body_part = body_part[:j] + "\n\n" + rd("src", "settings.html").replace("/*SQL*/", rd("supabase", "setup.sql").replace("&", "&amp;").replace("<", "&lt;")) + body_part[j:]

doc = """<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f1f4f8">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="マイ単語帳">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%232563eb'/%3E%3Cpath d='M9 8h11a3 3 0 0 1 3 3v13H12a3 3 0 0 1-3-3V8z' fill='none' stroke='white' stroke-width='2'/%3E%3C/svg%3E">
<style>
  /* what the claude.ai viewer adds around an artifact */
  :root { color-scheme: light; padding: env(safe-area-inset-top, 0px) 0 env(safe-area-inset-bottom, 0px); }
  body { margin: 0; font: 14px system-ui, sans-serif; }
  img { max-width: 100%; }
  [hidden] { display: none !important; }
</style>
<script>
@@SHIM@@
</script>
@@HEAD@@
</head>
<body>
@@BODY@@
</body>
</html>
"""
doc = doc.replace("@@SHIM@@", rd("src", "shim.js")).replace("@@HEAD@@", head_part.strip()).replace("@@BODY@@", body_part)

io.open(os.path.join(HERE, "index.html"), "w", encoding="utf-8", newline="\n").write(doc)
print("index.html", len(doc.encode("utf-8")), "bytes")
