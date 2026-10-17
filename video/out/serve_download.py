"""Tiny download server for the finished film (0.0.0.0:8080)."""
import os
import html
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import quote, unquote

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "8080"))

FILES = [
    ("alzheimers_10_tips.mp4", "The film — master 1080p", "1920×1080 · 30 fps · 2:04 · H.264 + AAC · upload this", "38 MB", True),
    ("alzheimers_10_tips_720p.mp4", "The film — light 720p", "1280×720 · 30 fps · 2:04 · fast download", "9.1 MB", False),
    ("thumbnail.png", "YouTube thumbnail", "1280×720 · under YouTube's 2 MB limit", "1.4 MB", False),
    ("alzheimers_10_tips.srt", "Captions (SRT)", "29 cues, timed to the picture", "3 KB", False),
    ("poster.png", "Poster still", "1920×1080 · community post / embed", "2.4 MB", False),
    ("score.mp3", "Music track", "Original score · royalty-free · yours", "3 MB", False),
]

MIME = {
    ".mp4": "video/mp4",
    ".png": "image/png",
    ".srt": "application/x-subrip; charset=utf-8",
    ".mp3": "audio/mpeg",
    ".md": "text/markdown; charset=utf-8",
}

PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Download — 10 Best Tips to Deal with Alzheimer's</title>
<style>
  :root {{ --ink:#050b0e; --cream:#f7f0e6; --amber:#e8b37a; --muted:#a9a79e; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:radial-gradient(120% 90% at 70% 10%,#123236 0%,#0a1c1f 45%,var(--ink) 100%);
         color:var(--cream); font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;
         min-height:100vh; padding:48px 20px; }}
  .wrap {{ max-width:760px; margin:0 auto; }}
  .eyebrow {{ letter-spacing:.34em; font-size:11px; color:var(--amber); text-transform:uppercase; font-weight:700; }}
  h1 {{ font-family:Georgia,"Times New Roman",serif; font-size:clamp(30px,5vw,46px); line-height:1.1; margin:14px 0 6px; }}
  .sub {{ color:var(--muted); margin:0 0 34px; }}
  .hero {{ display:block; text-decoration:none; color:#08120f; background:linear-gradient(180deg,#ffd6a5,#e8b37a);
           padding:20px 24px; border-radius:16px; font-weight:800; font-size:19px; text-align:center;
           box-shadow:0 18px 50px -18px rgba(232,179,122,.85); transition:transform .15s ease; }}
  .hero:hover {{ transform:translateY(-2px); }}
  .hero span {{ display:block; font-weight:500; font-size:13px; opacity:.75; margin-top:4px; letter-spacing:.04em; }}
  .row {{ display:flex; align-items:center; gap:16px; padding:16px 18px; border:1px solid rgba(255,255,255,.09);
          border-radius:14px; margin-top:12px; background:rgba(255,255,255,.03); }}
  .row .name {{ flex:1; }}
  .row .name b {{ display:block; font-size:15px; }}
  .row .name small {{ color:var(--muted); font-size:12.5px; }}
  .dl {{ color:var(--amber); text-decoration:none; font-weight:700; font-size:14px; white-space:nowrap;
         border:1px solid rgba(232,179,122,.45); padding:8px 14px; border-radius:999px; }}
  .dl:hover {{ background:rgba(232,179,122,.12); }}
  .note {{ margin-top:30px; color:var(--muted); font-size:12.5px; line-height:1.6; }}
  video {{ width:100%; border-radius:14px; margin-bottom:24px; background:#000; }}
</style></head><body><div class="wrap">
  <div class="eyebrow">Ready to publish</div>
  <h1>10 Best Tips to<br>Deal with Alzheimer’s</h1>
  <p class="sub">1920×1080 · 30 fps · 2:04 · loudness-normalised to −14 LUFS</p>

  <video controls playsinline preload="metadata" src="/file/alzheimers_10_tips.mp4"></video>

  <a class="hero" href="/download/alzheimers_10_tips.mp4">
    ⬇&nbsp; Download the film (MP4 · 38 MB)
    <span>Tap to save — upload straight to YouTube</span>
  </a>

  {rows}

  <p class="note">Every file is served directly from the render workspace. The film has passed a
  full decode test (no errors) and carries its own original, royalty-free score.
  Thumbnail is 1280×720 and under YouTube’s 2 MB limit.</p>

  <p class="note" style="margin-top:22px">Backup links on GitHub (public, permanent):
  <a style="color:var(--amber)" href="https://github.com/Heartaker/Heartaker/releases/tag/v1.0-alzheimers-tips">release page</a> ·
  <a style="color:var(--amber)" href="https://github.com/Heartaker/Heartaker/raw/arena/580c9563-heartaker/video/out/alzheimers_10_tips.mp4">1080p master</a> ·
  <a style="color:var(--amber)" href="https://github.com/Heartaker/Heartaker/raw/arena/580c9563-heartaker/video/out/alzheimers_10_tips_720p.mp4">720p light</a></p>
</div></body></html>
"""


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _find(self, name):
        for f in FILES:
            if f[0] == name:
                return f
        return None

    def do_GET(self):
        self._serve(send_body=True)

    def do_HEAD(self):
        self._serve(send_body=False)

    def _serve(self, send_body=True):
        path = unquote(self.path.split("?")[0])
        if path in ("/", "/index.html"):
            rows = []
            for name, label, desc, size, _ in FILES:
                rows.append(
                    f'<div class="row"><div class="name"><b>{html.escape(label)}</b>'
                    f'<small>{html.escape(desc)} · {size}</small></div>'
                    f'<a class="dl" href="/download/{quote(name)}">Download</a></div>')
            body = PAGE.format(rows="\n".join(rows)).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if send_body:
                self.wfile.write(body)
            return

        for prefix, as_attachment in (("/download/", True), ("/file/", False)):
            if path.startswith(prefix):
                name = path[len(prefix):]
                meta = self._find(name)
                if not meta:
                    self.send_error(404)
                    return
                full = os.path.join(ROOT, name)
                if not os.path.exists(full):
                    self.send_error(404)
                    return
                size = os.path.getsize(full)
                ext = os.path.splitext(name)[1].lower()
                rng = self.headers.get("Range")
                start, end = 0, size - 1
                status = 200
                if rng and rng.startswith("bytes="):
                    try:
                        s, e = rng[6:].split("-", 1)
                        start = int(s) if s else 0
                        end = int(e) if e else size - 1
                        end = min(end, size - 1)
                        status = 206
                    except ValueError:
                        pass
                length = end - start + 1
                self.send_response(status)
                self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
                self.send_header("Content-Length", str(length))
                self.send_header("Accept-Ranges", "bytes")
                if status == 206:
                    self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
                if as_attachment:
                    self.send_header("Content-Disposition",
                                     f'attachment; filename="{name}"')
                self.send_header("Cache-Control", "public, max-age=3600")
                self.end_headers()
                if not send_body:
                    return
                with open(full, "rb") as fh:
                    fh.seek(start)
                    remaining = length
                    while remaining > 0:
                        chunk = fh.read(min(1 << 20, remaining))
                        if not chunk:
                            break
                        try:
                            self.wfile.write(chunk)
                        except (BrokenPipeError, ConnectionResetError):
                            return
                        remaining -= len(chunk)
                return

        if path == "/health":
            self.send_response(200)
            self.send_header("Content-Length", "2")
            self.end_headers()
            if send_body:
                self.wfile.write(b"ok")
            return

        self.send_error(404)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"serving {ROOT} on 0.0.0.0:{PORT}", flush=True)
    srv.serve_forever()
