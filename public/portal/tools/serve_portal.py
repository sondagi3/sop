#!/usr/bin/env python3
"""BrandM3dia KioskOps Portal - Local Server (v4.1)

Why this exists:
- Some Python environments serve .js as text/plain, causing Chrome/Edge to BLOCK scripts.
- This server forces correct MIME types for .js/.css/.json so the portal always works.

Usage:
  python3 tools/serve_portal.py
Then open:
  http://localhost:8787/index.html

Tip:
  If port 8787 is already in use, stop the old server or change PORT below.
"""

import http.server
import socketserver
import os
import pathlib
import mimetypes

PORT = 8787
ROOT = pathlib.Path(__file__).resolve().parents[1]  # portal root

# Force MIME types (prevents "Portal script did not load" caused by strict MIME checking)
mimetypes.add_type("application/javascript; charset=utf-8", ".js")
mimetypes.add_type("text/css; charset=utf-8", ".css")
mimetypes.add_type("application/json; charset=utf-8", ".json")

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    # Extra safety: override guess_type for critical extensions
    def guess_type(self, path):
        p = path.lower()
        if p.endswith(".js"):
            return "application/javascript; charset=utf-8"
        if p.endswith(".css"):
            return "text/css; charset=utf-8"
        if p.endswith(".json"):
            return "application/json; charset=utf-8"
        return super().guess_type(path)

if __name__ == "__main__":
    os.chdir(str(ROOT))

    # Quick sanity checks
    must_exist = [
        ROOT / "index.html",
        ROOT / "assets" / "app.js",
        ROOT / "assets" / "app.css",
    ]
    missing = [str(p) for p in must_exist if not p.exists()]
    if missing:
        print("ERROR: Portal files missing. Re-extract the ZIP. Missing:")
        for m in missing:
            print(" -", m)
        raise SystemExit(1)

    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving portal from: {ROOT}")
        print(f"Open: http://localhost:{PORT}/index.html")
        print(f"Debug check: http://localhost:{PORT}/assets/app.js (should show JavaScript)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
