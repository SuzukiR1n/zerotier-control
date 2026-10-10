import json
import os
from pathlib import Path
import urllib.request

try:
    home = Path(os.getenv("ZT_HOME", "/var/lib/zerotier-one"))
    token = (home / "authtoken.secret").read_text().strip()
    port = int(os.getenv("ZT_PORT", "9993"))
    request = urllib.request.Request(f"http://127.0.0.1:{port}/status", headers={"X-ZT1-AUTH": token})
    with urllib.request.urlopen(request, timeout=3) as response:
        assert json.load(response)["version"] == "1.16.2"
    assert (home / "planet").stat().st_size > 100
except Exception:
    raise SystemExit(1)
