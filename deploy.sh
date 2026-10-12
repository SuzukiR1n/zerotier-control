#!/usr/bin/env bash
# Standalone Planet + current ZeroTier controller + Web, managed in one place.
set -Eeuo pipefail
umask 077
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$ROOT"
COMMAND="${1:-menu}"
[[ $# -eq 0 ]] || shift
IP='' IPV6='' ZT_PORT_OPTION='' WEB_PORT_OPTION='' ACCESS='' ORIGIN='' PROJECT=''
SKIP_PULL=false
DOCKER_REGISTRY_OPTION='' DOCKER_FALLBACKS_OPTION='' GITHUB_PROXY_OPTION='' DOWNLOAD_OPTIONS=false
EXTRA_COMPOSE=()
RESTART_AFTER_BACKUP=()

fail() { printf '\n%s\n' "$*" >&2; exit 1; }
usage() {
  cat <<'HELP'
ZeroTier Control 部署工具
  bash deploy.sh                          打开管理菜单
  bash deploy.sh install                   交互安装 / 启动已有部署
  bash deploy.sh update                    备份、拉取源码并更新
  bash deploy.sh status                    查看状态和访问地址
  bash deploy.sh planet                    导出客户端 Planet
  bash deploy.sh backup                    完整备份身份、网络、Web 数据和配置
  bash deploy.sh reset-password            重置账号为 admin / admin 并要求首次修改
  bash deploy.sh logs                      查看最近日志并持续跟踪
  bash deploy.sh uninstall                 移除容器，保留配置和全部数据卷
  bash deploy.sh downloads                 配置 Docker 与 GitHub 下载加速

无人值守首次安装示例：
  bash deploy.sh install --ip 你的公网IP --zt-port 9993 --web-port 3443 --access public
  --ipv6 地址                同时添加 IPv6 Planet 地址
  --access public|local|proxy  公网直连 / SSH 隧道 / 已有 HTTPS 反向代理
  --origin https://域名       HTTPS 模式的访问地址
  --project-name 名称         首次设置独立的 Compose 部署名称
  --compose-file 文件         追加 Compose 配置（可重复）
  --docker-registry 域名       项目使用的 Docker Hub 加速仓库
  --docker-fallbacks auto|none|域名列表  自动切换公开源 / 单一源 / 逗号分隔候补
  --github-proxy HTTPS前缀     GitHub 源码和仓库加速；direct 表示直连
  update --skip-pull          只备份并重建当前源码，不拉取 Git
已有 .env 时会沿用配置；修改 IP / 端口须按 README 的 Planet 更新流程操作。
HELP
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ip|--ipv6|--zt-port|--web-port|--access|--origin|--project-name|--compose-file|--docker-registry|--docker-fallbacks|--github-proxy)
      [[ $# -ge 2 && -n "$2" ]] || fail "$1 缺少值"
      case "$1" in
        --ip) IP="$2";; --ipv6) IPV6="$2";; --zt-port) ZT_PORT_OPTION="$2";;
        --web-port) WEB_PORT_OPTION="$2";; --access) ACCESS="$2";; --origin) ORIGIN="$2";;
        --project-name) PROJECT="$2";; --compose-file) EXTRA_COMPOSE+=(-f "$2");;
        --docker-registry) DOCKER_REGISTRY_OPTION="$2"; DOWNLOAD_OPTIONS=true;;
        --docker-fallbacks) DOCKER_FALLBACKS_OPTION="$2"; DOWNLOAD_OPTIONS=true;;
        --github-proxy) GITHUB_PROXY_OPTION="$2"; DOWNLOAD_OPTIONS=true;;
      esac
      shift 2;;
    --skip-pull) SKIP_PULL=true; shift;;
    --help|-h) usage; exit 0;;
    *) fail "未知参数：$1。使用 bash deploy.sh help 查看用法。";;
  esac
done
[[ "$COMMAND" != help && "$COMMAND" != --help && "$COMMAND" != -h ]] || { usage; exit 0; }
case "$COMMAND" in menu|install|update|status|planet|backup|reset-password|logs|uninstall|downloads) ;; *) fail "未知操作：$COMMAND";; esac
[[ "$(uname -s)" == Linux ]] || fail '部署脚本需要在 Linux 服务器运行。'
[[ "$EUID" -eq 0 ]] || fail '请使用 root，或运行 sudo bash deploy.sh。'
[[ "$ROOT" != *,* ]] || fail '项目目录不能包含逗号（Docker 挂载路径限制）。'
# shellcheck source=deploy/downloads.sh
. "$ROOT/deploy/downloads.sh"

compose() { docker compose --project-directory "$ROOT" --env-file "$ROOT/.env" -f "$ROOT/compose.yaml" "${EXTRA_COMPOSE[@]}" "$@"; }
cleanup() {
  local code=$?
  if [[ ${#RESTART_AFTER_BACKUP[@]} -gt 0 ]]; then
    printf '\n正在恢复备份前运行的服务……\n' >&2
    compose start "${RESTART_AFTER_BACKUP[@]}" || true
  fi
  return "$code"
}
trap cleanup EXIT
trap 'printf "\n操作失败（脚本第 %s 行）。已有配置和数据已保留；可运行 bash deploy.sh logs 查看服务日志。\n" "$LINENO" >&2' ERR
trap 'exit 130' INT
trap 'exit 143' TERM

install_docker() {
  local answer distro codename architecture package
  [[ -t 0 ]] || fail '未安装 Docker。请先安装 Docker Engine 与 Compose 插件后重试。'
  read -r -p '未检测到 Docker。是否从 Docker 官方软件源安装？[y/N] ' answer
  [[ "$answer" == y || "$answer" == Y ]] || fail '已取消。Docker 安装说明见 README。'
  # This is the operating system's file, never the project's .env.
  # shellcheck source=/dev/null
  . /etc/os-release
  distro="${ID:-}"; codename="${VERSION_CODENAME:-}"
  [[ "$distro" == debian || "$distro" == ubuntu ]] || fail '自动安装只支持 Debian / Ubuntu；其他系统请先安装 Docker。'
  [[ "$codename" =~ ^[a-z]+$ ]] || fail '无法识别系统版本。'
  for package in docker.io docker-compose docker-doc docker-buildx podman-docker containerd runc; do
    if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q '^install ok installed$'; then
      fail "发现已有 $package 软件包，请先按 Docker 官方文档处理安装冲突。脚本不会移除系统软件。"
    fi
  done
  apt-get update
  apt-get install -y ca-certificates curl
  architecture="$(dpkg --print-architecture)"
  install -m 0755 -d /etc/apt/keyrings
  curl --fail --silent --show-error --location "https://download.docker.com/linux/$distro/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  printf 'Types: deb\nURIs: https://download.docker.com/linux/%s\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' "$distro" "$codename" "$architecture" > /etc/apt/sources.list.d/docker.sources
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
}
require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    [[ "$COMMAND" == install || "$COMMAND" == menu ]] || fail '请先安装 Docker。'
    install_docker
  fi
  docker info >/dev/null 2>&1 || fail 'Docker 服务未运行，或当前用户无权访问 Docker。'
  docker compose version >/dev/null 2>&1 || fail '需要 Docker Compose v2 插件，请按 README 安装。'
  local compose_help
  compose_help="$(docker compose up --help)"
  [[ "$compose_help" == *--wait-timeout* ]] || fail 'Compose 版本过旧，请更新 Docker Compose 插件。'
}
web_image() {
  if ! docker image inspect zerotier-control:local >/dev/null 2>&1; then
    prepare_images missing node:24-bookworm-slim
    printf '准备部署工具（首次需要构建 Web 镜像）……\n'
    docker build --build-arg "DOCKER_REGISTRY=$DOCKER_REGISTRY" -t zerotier-control:local .
  fi
}
prepare_stack_images() {
  # Preflight all FROM images and the gateway before building or replacing containers.
  prepare_images "${1:-missing}" node:24-bookworm-slim debian:bookworm-slim python:3.13-slim-bookworm nginx:stable-alpine
}
helper() {
  docker run --rm --user 0:0 --network none --cap-drop ALL --cap-add DAC_OVERRIDE --cap-add FOWNER --security-opt no-new-privileges:true \
    --mount "type=bind,src=$ROOT,dst=/work" --workdir /work --entrypoint node \
    zerotier-control:local scripts/deploy-config.js "$@"
}
load_config() {
  [[ -f .env ]] || fail '尚未安装。请先运行 bash deploy.sh install。'
  web_image
  local values key value
  values="$(helper env)"
  # Read validated values as data. Never execute .env with source / eval.
  while IFS='=' read -r key value; do
    case "$key" in COMPOSE_PROJECT_NAME|PLANET_ENDPOINTS|ZT_PORT|WEB_PORT|WEB_BIND_ADDRESS|ADMIN_PASSWORD_PATH|PUBLIC_ORIGIN|COOKIE_SECURE)
      printf -v "$key" '%s' "$value"; export "${key?}";;
      *) fail '配置工具返回了未知字段。';;
    esac
  done <<< "$values"
  compose config --quiet
}
configure() {
  local detected='' answer
  if [[ -z "$IP" ]]; then
    [[ -t 0 ]] || fail '无人值守安装需要 --ip 公网IP。'
    if command -v curl >/dev/null 2>&1; then
      detected="$(curl --ipv4 --connect-timeout 3 --max-time 5 --fail --silent https://api.ipify.org || true)"
    fi
    read -r -p "服务器公网 IPv4 / IPv6${detected:+ [$detected]}：" IP
    IP="${IP:-$detected}"
    read -r -p '附加公网 IPv6（可留空）：' IPV6
    read -r -p 'ZeroTier UDP 端口 [9993]：' ZT_PORT_OPTION
    read -r -p 'Web 管理端口 [3443]：' WEB_PORT_OPTION
    printf '\nWeb 访问：1. 公网 IP 直连  2. SSH 隧道  3. 已有 HTTPS 反向代理\n'
    read -r -p '请选择 [1]：' answer
    case "${answer:-1}" in 1) ACCESS=public;; 2) ACCESS=local;; 3) ACCESS=proxy;; *) fail '访问方式选择错误。';; esac
    if [[ "$ACCESS" == proxy ]]; then read -r -p 'HTTPS 访问地址（例如 https://control.example.com）：' ORIGIN; fi
  fi
  local options=(--ip "$IP" --zt-port "${ZT_PORT_OPTION:-9993}" --web-port "${WEB_PORT_OPTION:-3443}" --access "${ACCESS:-public}")
  [[ -z "$IPV6" ]] || options+=(--ipv6 "$IPV6")
  [[ -z "$ORIGIN" ]] || options+=(--origin "$ORIGIN")
  [[ -z "$PROJECT" ]] || options+=(--project-name "$PROJECT")
  helper init "${options[@]}"
}
export_planet() {
  mkdir -p data/zerotier/dist
  compose cp control:/app/planet/planet data/zerotier/dist/planet
  compose cp control:/app/planet/planet.json data/zerotier/dist/planet.json
  printf '客户端文件：%s/data/zerotier/dist/planet\n' "$ROOT"
  sha256sum data/zerotier/dist/planet
}
info() {
  compose ps
  printf '\nWeb 地址：%s\n首次安装或重置后的账号：admin / admin；首次登录必须修改用户名和密码。\n旧版升级使用用户名 admin 和原管理密码登录；已修改的账号保存在 Web 数据卷中。\nPlanet：%s/data/zerotier/dist/planet\nZeroTier 放行：UDP %s\n' "$PUBLIC_ORIGIN" "$ROOT" "$ZT_PORT"
  if [[ "$WEB_BIND_ADDRESS" == 127.0.0.1 && "$COOKIE_SECURE" == false ]]; then
    printf '在电脑建立隧道：ssh -L %s:127.0.0.1:%s root@服务器IP\n' "$WEB_PORT" "$WEB_PORT"
  elif [[ "$COOKIE_SECURE" == true ]]; then
    printf '请将 HTTPS 域名反向代理到服务器 127.0.0.1:%s，并保留 Host。\n' "$WEB_PORT"
  else
    printf '网页放行：TCP %s。HTTP 传输未加密，可按 README 配置 HTTPS。\n' "$WEB_PORT"
  fi
}
backup() {
  local directory running
  # Convert legacy plaintext before copying any password file into a new backup.
  helper password
  directory="$ROOT/backups/$(date -u +%Y%m%dT%H%M%SZ)-$$"
  mkdir -p "$directory"
  running="$(compose ps --services --filter status=running)"
  if [[ -n "$running" ]]; then mapfile -t RESTART_AFTER_BACKUP <<< "$running"; fi
  compose stop
  cp .env "$directory/.env"
  if [[ -f .download.env ]]; then cp .download.env "$directory/.download.env"; fi
  cp "$ADMIN_PASSWORD_PATH" "$directory/admin-password"
  chmod 600 "$directory/.env" "$directory/admin-password"
  compose cp controller:/var/lib/zerotier-one "$directory/zerotier-one"
  compose cp control:/app/data "$directory/web-data"
  cp package.json "$directory/package.json"
  if command -v git >/dev/null 2>&1 && git rev-parse HEAD >/dev/null 2>&1; then git rev-parse HEAD > "$directory/source-commit"; fi
  if [[ ${#RESTART_AFTER_BACKUP[@]} -gt 0 ]]; then
    compose start "${RESTART_AFTER_BACKUP[@]}"
    RESTART_AFTER_BACKUP=()
  fi
  printf '完整备份：%s（包含私钥和密码，目录权限 700，请加密保管）\n' "$directory"
}
install_stack() {
  web_image
  if [[ -f .env ]]; then
    [[ -z "$IP$IPV6$ZT_PORT_OPTION$WEB_PORT_OPTION$ACCESS$ORIGIN$PROJECT" ]] || fail '已存在 .env；拒绝用安装参数覆盖既有配置，请直接运行 install 沿用配置。'
    printf '检测到已有配置，将复用身份、Planet、密码和网络数据。\n'
  else configure; fi
  load_config
  helper password
  prepare_stack_images
  printf '构建并启动 ZeroTier、Planet 和新 Web；首次编译可能需要数分钟……\n'
  compose build
  compose up -d --no-build --pull never --wait --wait-timeout 180
  export_planet
  info
}
update_stack() {
  if [[ "$SKIP_PULL" == false ]]; then
    command -v git >/dev/null 2>&1 || fail '需要 Git；离线源码使用 update --skip-pull。'
    git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail '当前目录不是 Git 仓库；使用 update --skip-pull 重建下载的源码。'
    if ! git diff --quiet || ! git diff --cached --quiet; then fail '有未提交的源码修改，请先保存修改；更新不会覆盖它们。'; fi
    prepare_project_pull
  fi
  load_config
  prepare_stack_images always
  backup
  if [[ "$SKIP_PULL" == false ]]; then pull_project; fi
  compose build
  compose up -d --no-build --force-recreate --pull never --wait --wait-timeout 180
  export_planet
  info
}
reset_password() {
  prepare_stack_images
  compose build control
  backup
  compose stop control
  helper password --reset
  compose run --rm --no-deps --entrypoint node control scripts/reset-account.js
  # Recreate bind mounts because resetting the file uses an atomic rename.
  compose up -d --force-recreate --pull never --wait --wait-timeout 180 control gateway
  printf '管理账号已重置为 admin / admin，旧会话已失效；登录后必须修改两项。\n'
  info
}
menu() {
  local selection
  printf '\nZeroTier Control · 私有 Planet + 新版 ZeroTier + 中文 Web\n\n'
  printf '1. 安装 / 启动\n2. 备份并更新\n3. 查看信息\n4. 导出 Planet\n5. 完整备份\n6. 重置管理账号\n7. 查看日志\n8. 移除容器（保留全部数据）\n9. 配置下载加速\n0. 退出\n\n'
  read -r -p '请选择操作：' selection
  case "$selection" in 1) COMMAND=install;; 2) COMMAND=update;; 3) COMMAND=status;; 4) COMMAND=planet;; 5) COMMAND=backup;; 6) COMMAND=reset-password;; 7) COMMAND=logs;; 8) COMMAND=uninstall;; 9) COMMAND=downloads;; 0) exit 0;; *) fail '请输入 0–9。';; esac
}
if [[ "$COMMAND" == menu ]]; then menu; fi
download_config
download_options
if [[ "$COMMAND" == downloads || "$DOWNLOAD_OPTIONS" == true ]]; then configure_downloads; fi
if [[ "$COMMAND" == downloads ]]; then exit 0; fi
if [[ "$COMMAND" == install && ! -f .download.env && -t 0 ]]; then configure_downloads; fi
require_docker
case "$COMMAND" in
  install) install_stack;; update) update_stack;;
  *) load_config
    case "$COMMAND" in
      status) info;; planet) export_planet;; backup) backup;; reset-password) reset_password;;
      logs) compose logs --tail 100 -f;;
      uninstall) compose down; printf '容器已移除。配置、密码和数据卷已保留；运行 install 可恢复。\n';;
    esac;;
esac
