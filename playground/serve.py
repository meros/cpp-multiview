#!/usr/bin/env python3
"""Serve playground/web with the headers that give browsers a finer clock.

Cross-origin isolation (COOP and COEP) lets performance.now() resolve about
5 microseconds instead of 100 or more. Usage: serve.py [port]
"""
import http.server
import os
import sys

WEB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".wasm": "application/wasm"}

    def __init__(self, *a, **k):
        super().__init__(*a, directory=WEB, **k)

    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler) as s:
        print(f"http://localhost:{port}")
        s.serve_forever()
