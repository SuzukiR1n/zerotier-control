"""Exercise the real curl downloader against an isolated HTTP proxy fixture."""
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import subprocess
import tempfile
import threading
import unittest


@unittest.skipUnless(os.name == "posix", "Source downloader runs in the Linux image")
class SourceDownloadTest(unittest.TestCase):
    def test_proxy_retry_and_checksum_rejection(self):
        payload = b"isolated source archive fixture"
        commit = "a" * 40
        checksum = hashlib.sha256(payload).hexdigest()
        state = {"requests": [], "invalid": False}

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                state["requests"].append(self.path)
                if len(state["requests"]) == 1:
                    self.send_response(503)
                    self.end_headers()
                    return
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"unexpected proxy HTML" if state["invalid"] else payload)

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as directory:
                output = Path(directory) / "source.tar.gz"
                env = {**os.environ, "GITHUB_PROXY": f"http://127.0.0.1:{server.server_port}/"}
                command = ["sh", "planet/download-source.sh", commit, checksum, str(output)]
                valid = subprocess.run(command, env=env, capture_output=True, text=True, timeout=30)
                self.assertEqual(valid.returncode, 0, valid.stderr)
                self.assertEqual(output.read_bytes(), payload)
                self.assertEqual(len(state["requests"]), 2)
                self.assertEqual(state["requests"][0], f"/https://github.com/zerotier/ZeroTierOne/archive/{commit}.tar.gz")
                state["invalid"] = True
                bad_output = Path(directory) / "invalid.tar.gz"
                rejected = subprocess.run(command[:-1] + [str(bad_output)], env=env, capture_output=True, text=True, timeout=30)
                self.assertNotEqual(rejected.returncode, 0)
                self.assertIn("checksum mismatch", rejected.stderr)
                self.assertFalse(bad_output.exists())
                self.assertFalse(Path(str(bad_output) + ".part").exists())
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
