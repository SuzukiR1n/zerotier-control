"""Fresh Planet + file-backed controller bootstrap. Identities are created at runtime."""
import ipaddress
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys


def endpoints(value):
    result = []
    for item in value.split(","):
        address, separator, port = item.strip().rpartition("/")
        if not separator or not port.isascii() or not port.isdecimal() or not 1 <= int(port) <= 65535:
            raise ValueError("PLANET_ENDPOINTS 必须是 IP/端口，多个地址用逗号分隔")
        ip = ipaddress.ip_address(address)
        if ip.is_unspecified or ip.is_multicast or "%" in address:
            raise ValueError("Planet 地址必须是可到达的 IPv4 / IPv6 地址")
        normalized = f"{ip}/{int(port)}"
        if normalized not in result:
            result.append(normalized)
    if not result or len(result) > 32:
        raise ValueError("Planet 需要 1–32 个 IP/端口地址")
    return result


def save(path, content, mode=0o600):
    temp = path.with_name(path.name + ".tmp")
    temp.write_bytes(content if isinstance(content, bytes) else content.encode())
    temp.chmod(mode)
    temp.replace(path)


def management_token(path):
    # Native zerotier-cli forwards file contents verbatim as an HTTP header.
    # Keep the existing token value, but remove surrounding file whitespace.
    existing = path.read_bytes() if path.exists() else None
    token = existing.strip() if existing is not None else secrets.token_hex(32).encode("ascii")
    if not token or any(char <= 32 or char >= 127 for char in token):
        raise ValueError("控制器管理密钥格式错误，请恢复 authtoken.secret 备份")
    if existing != token:
        save(path, token)
    return token


def prepare(regenerate=False):
    os.umask(0o077)
    home = Path(os.getenv("ZT_HOME", "/var/lib/zerotier-one"))
    public = Path(os.getenv("PLANET_DIR", "/app/planet"))
    access = Path(os.getenv("TOKEN_DIR", "/run/controller"))
    for folder in (home, public, access):
        folder.mkdir(parents=True, exist_ok=True)
    port = int(os.getenv("ZT_PORT", "9993"))
    if not 1 <= port <= 65535:
        raise ValueError("ZT_PORT 必须在 1–65535 之间")
    settings = {"endpoints": endpoints(os.getenv("PLANET_ENDPOINTS", "")), "port": port}
    saved, planet = home / "planet-settings.json", home / "planet"
    if saved.exists() and json.loads(saved.read_text()) != settings and not regenerate:
        raise ValueError("Planet 地址配置已变化。先停服务，再显式运行 --regenerate 并重新分发客户端文件")
    if planet.exists() and not (home / "identity.secret").exists():
        raise ValueError("已有 Planet 缺少节点身份，请恢复完整备份")
    if not (home / "identity.secret").exists():
        subprocess.run(["zerotier-idtool", "generate", str(home / "identity.secret"), str(home / "identity.public")], check=True, stdout=subprocess.DEVNULL)
    if not (home / "identity.public").exists():
        identity = subprocess.check_output(["zerotier-idtool", "getpublic", str(home / "identity.secret")])
        save(home / "identity.public", identity)
    if not planet.exists() or regenerate:
        config = {"roots": [{"identity": (home / "identity.public").read_text().strip(), "stableEndpoints": settings["endpoints"]}]}
        save(home / "world.json", json.dumps(config))
        metadata = subprocess.check_output(["zt-world", "generate", "world.json", "planet"], cwd=home)
        save(saved, json.dumps(settings))
    else:
        for key in ("previous.c25519", "current.c25519"):
            if not (home / key).exists():
                raise ValueError("已有 Planet 缺少签名密钥，请恢复完整备份")
        metadata = subprocess.check_output(["zt-world", "inspect", str(planet)])
    info = json.loads(metadata)
    info["zerotierVersion"] = "1.16.2"
    save(public / "planet", planet.read_bytes(), 0o644)
    save(public / "planet.json", json.dumps(info, ensure_ascii=False, indent=2), 0o644)
    token = home / "authtoken.secret"
    save(access / "authtoken.secret", management_token(token))
    conf = home / "local.conf"
    local = json.loads(conf.read_text()) if conf.exists() else {}
    local.setdefault("settings", {}).update({"primaryPort": port, "secondaryPort": 0, "tertiaryPort": 0, "portMappingEnabled": False, "allowTcpFallbackRelay": False})
    save(conf, json.dumps(local))
    print(f"Planet 已准备，ZeroTier 1.16.2 将监听 UDP {port}", flush=True)
    return home, port


if __name__ == "__main__":
    try:
        if set(sys.argv[1:]) - {"--prepare-only", "--regenerate"}:
            raise ValueError("不支持的启动参数")
        home, port = prepare("--regenerate" in sys.argv)
        if "--prepare-only" not in sys.argv and "--regenerate" not in sys.argv:
            os.execvp("zerotier-one", ["zerotier-one", "-U", f"-p{port}", str(home)])
    except Exception as error:
        print(f"启动失败：{error}", file=sys.stderr)
        sys.exit(1)
