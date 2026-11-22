#!/usr/bin/env python3
"""Local test server: serves the app and fakes the two services it talks to, so everything can be tried without accounts or keys.

    python tools/dev_server.py [port]        # default 8765, then open http://localhost:8765/

  /                          the app (index.html and data/)
  /mock/supabase/...         the three RPC functions of supabase/setup.sql, kept in memory
                             -> in 設定 use  URL: http://localhost:8765/mock/supabase   key: anything   code: 16+ characters
  /mock/openai/v1/...        a fake Chat Completions endpoint that answers in the format the app asks for
                             -> in 設定 use  API の場所: http://localhost:8765/mock/openai/v1   key: anything
  /mock/_state, /mock/_fail  (tests) inspect the fake database / make the fake Supabase fail on purpose
"""
import json, os, re, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = {}          # sync_code -> {id: data}
STATE = {"fail": False, "calls": []}


def fake_entry(word):
    return {
        "word": word, "status": "ok", "pos": "動" if not word.endswith("ion") else "名", "meaning_ja": "（テスト）" + word,
        "ipa": "tɛst", "genre": "action", "example": "*%s* it" % word, "example_ja": "テスト", "headword": None,
        "derived": [{"word": word + "ion", "pos": "名", "meaning_ja": "名詞形"}],
        "senses": [] if word != "address" else [
            {"meaning_ja": "住所", "pos": "名", "example": "a business *address*", "example_ja": "会社の住所"},
            {"meaning_ja": "対処する", "pos": "動", "example": "*address* the problem", "example_ja": "問題に対処する"}],
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, fmt, *args):
        if "/mock/" in (args[0] if args else ""):
            sys.stderr.write("%s\n" % (fmt % args))

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "authorization, apikey, content-type")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/mock/_state"):
            return self._json(200, {"db": DB, "calls": STATE["calls"]})
        if self.path.startswith("/mock/_fail"):
            STATE["fail"] = "on" in self.path
            return self._json(200, {"fail": STATE["fail"]})
        return super().do_GET()

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(n) if n else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except Exception:
            return self._json(400, {"message": "bad json"})
        p = self.path.split("?")[0]
        if p.startswith("/mock/supabase/rest/v1/rpc/"):
            return self._supabase(p.rsplit("/", 1)[1], body)
        if p.startswith("/mock/openai/v1/chat/completions"):
            return self._openai(body)
        return self._json(404, {"message": "not found"})

    def _supabase(self, fn, body):
        if not self.headers.get("apikey") or not (self.headers.get("Authorization") or "").startswith("Bearer "):
            return self._json(401, {"message": "No API key found in request"})
        STATE["calls"].append(fn)
        if STATE["fail"]:
            return self._json(503, {"message": "down for the test"})
        code = body.get("code", "")
        if len(code) < 16:
            return self._json(400, {"message": "sync code too short"})
        rows = DB.setdefault(code, {})
        if fn == "mytango_list":
            ids = sorted(rows)[max(body.get("p_offset", 0), 0):][:min(max(body.get("p_limit", 1000), 1), 1000)]
            return self._json(200, [{"id": i, "data": rows[i]} for i in ids])
        if fn == "mytango_put":
            rows[body["doc_id"]] = body["doc"]
            self.send_response(204); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); return
        if fn == "mytango_delete":
            rows.pop(body["doc_id"], None)
            self.send_response(204); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); return
        return self._json(404, {"message": "unknown function"})

    def _openai(self, body):
        if (self.headers.get("Authorization") or "") != "Bearer test-key":
            return self._json(401, {"error": {"message": "Incorrect API key"}})
        prompt = body["messages"][-1]["content"]
        if "Reply with only this JSON" in prompt:
            text = "[1]"
        elif "主な派生語を調べ" in prompt:
            ws = [re.sub(r"（.*$", "", l) for l in prompt.split("「語（品詞）」の形）:\n")[1].split("\n")]
            text = "```json\n" + json.dumps([{"word": w, "derived": fake_entry(w)["derived"]} for w in ws], ensure_ascii=False) + "\n```"
        elif "複数あるかを調べ" in prompt:
            w = re.sub(r"（.*$", "", prompt.split("入力:\n")[1])
            text = json.dumps([{"word": w, "senses": fake_entry("address")["senses"]}], ensure_ascii=False)
        else:
            ws = prompt.split("入力（1行に1語）:\n")[1].split("\n")
            text = "結果です。\n" + json.dumps([fake_entry(w) for w in ws], ensure_ascii=False)   # a sentence before the JSON, like real models do
        return self._json(200, {"choices": [{"message": {"role": "assistant", "content": text}, "finish_reason": "stop"}]})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print("http://localhost:%d/   (Ctrl+C to stop)" % port)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
