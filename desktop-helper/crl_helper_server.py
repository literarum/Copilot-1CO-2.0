"""
CRL Helper HTTP server — same contract as helper/crl-helper.js.
Serves GET /, GET /health, GET /helper?url=<CRL_URL>, OPTIONS.
CORS enabled; only FNS CRL hosts allowed (SSRF protection).

Concurrency: The browser sends ~6 parallel GET /helper?url=... requests (12s timeout each).
A single-threaded server would process them sequentially; the first upstream fetch can take
up to 30s, so later requests exceed the browser timeout and abort (ERR_SOCKET_NOT_CONNECTED),
and failed upstream or write-after-abort can yield 502/500. This module uses ThreadingMixIn
so each request is handled in its own thread and parallel requests succeed.
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from threading import Thread

FNS_CRL_ALLOWED_HOSTS = frozenset(
    {"pki.tax.gov.ru", "cdp.tax.gov.ru", "uc.nalog.ru"}
)

CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "*")
CORS_HEADERS = {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
}

PORT = int(os.environ.get("PORT", "7777"))
HOST = os.environ.get("HOST", "127.0.0.1")


def is_allowed_crl_host(hostname: str) -> bool:
    if not hostname:
        return False
    h = hostname.lower().strip()
    if h.startswith("[") and h.endswith("]"):
        h = h[1:-1]
    return h in FNS_CRL_ALLOWED_HOSTS


def set_cors(handler: BaseHTTPRequestHandler) -> None:
    for k, v in CORS_HEADERS.items():
        handler.send_header(k, v)


class CRLHelperHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # quiet by default; override to enable logging

    def send_json(self, status: int, data: dict) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        set_cors(self)
        self.end_headers()
        self.wfile.write(body)

    def send_cors_only(self, status: int = 204) -> None:
        self.send_response(status)
        set_cors(self)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_cors_only(204)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = (parsed.path or "/").rstrip("/") or "/"
        query = urllib.parse.parse_qs(parsed.query)

        if path in ("/", "/health"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            body = json.dumps({"ok": True}).encode("utf-8")
            self.send_header("Content-Length", str(len(body)))
            set_cors(self)
            self.end_headers()
            self.wfile.write(body)
            return

        if path != "/helper":
            self.send_response(404)
            set_cors(self)
            self.end_headers()
            self.wfile.write(b"Not found")
            return

        url_param = (query.get("url") or [""])[0]
        if not url_param:
            self.send_json(400, {"error": "missing url parameter"})
            return

        try:
            target = urllib.parse.urlparse(url_param)
        except Exception:
            self.send_json(400, {"error": "invalid url parameter"})
            return

        if target.scheme not in ("http", "https"):
            self.send_json(400, {"error": "unsupported protocol, only http/https allowed"})
            return

        if not is_allowed_crl_host(target.hostname):
            self.send_json(
                400,
                {
                    "error": "host not allowed (only FNS CRL hosts: pki.tax.gov.ru, cdp.tax.gov.ru, uc.nalog.ru)"
                },
            )
            return

        try:
            self._do_helper_fetch(url_param, target)
        except (BrokenPipeError, ConnectionResetError):
            pass  # Client disconnected; nothing to send
        except Exception as e:
            try:
                self.send_json(502, {"error": str(e)})
            except (BrokenPipeError, ConnectionResetError):
                pass

    def _do_helper_fetch(self, url_param: str, target: urllib.parse.ParseResult) -> None:
        """Fetch CRL from upstream and send response; may raise on client disconnect during write."""
        # Для ФНС-hostов пробуем HTTP, затем HTTPS (если исходный был HTTPS)
        host = (target.hostname or "").lower()
        path_and_query = (target.path or "") + (f"?{target.query}" if target.query else "")
        http_url = f"http://{host}{path_and_query}"
        https_url = f"https://{host}{path_and_query}"
        if host in FNS_CRL_ALLOWED_HOSTS and target.scheme == "https":
            candidates = [http_url, https_url]
        else:
            candidates = [url_param]

        last_exc: Exception | None = None
        last_status: int | None = None
        status = 200
        data = b""
        content_type = "application/octet-stream"

        for candidate in candidates:
            try:
                req = urllib.request.Request(
                    candidate,
                    method="GET",
                    headers={"User-Agent": "CRL-Helper-Desktop/1.0"},
                )
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = resp.read()
                    content_type = resp.headers.get("Content-Type", "application/octet-stream")
                    status = resp.getcode()
                last_status = status
                last_exc = None
                break
            except urllib.error.HTTPError as e:
                last_exc = e
                last_status = e.code
                continue
            except (urllib.error.URLError, OSError, TimeoutError) as e:
                last_exc = e
                last_status = None
                continue
            except Exception as e:
                last_exc = e
                last_status = None
                continue

        if last_exc is not None:
            if isinstance(last_exc, urllib.error.HTTPError) and last_status is not None:
                self.send_json(last_status, {"error": f"HTTP {last_status}"})
            else:
                self.send_json(502, {"error": str(last_exc)})
            return

        self.send_response(last_status or status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        set_cors(self)
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass  # Client aborted; avoid 500/crash


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Handle each request in a separate thread so parallel /helper requests succeed."""


def run_server(port: int = PORT, host: str = HOST) -> HTTPServer:
    server = ThreadedHTTPServer((host, port), CRLHelperHandler)
    return server


def run_server_in_thread(port: int = PORT, host: str = HOST) -> HTTPServer:
    server = run_server(port, host)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server
