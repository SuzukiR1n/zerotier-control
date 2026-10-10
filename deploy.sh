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
DOCKER_REGISTRY_OPTION='' GITHUB_PROXY_OPTION='' DOWNLOAD_OPTIONS=false
EXTRA_COMPOSE=()
RESTART_AFTER_BACKUP=()

fail() { printf '\n%s\n' "$*" >&2; exit 1; }
usage() {
  cat <<'HELP'
ZeroTier Control ���𹤾�
  bash deploy.sh                          �򿪹����˵�
  bash deploy.sh install                   ������װ / �������в���
  bash deploy.sh update                    ���ݡ���ȡԴ�벢����
  bash deploy.sh status                    �鿴״̬�ͷ��ʵ�ַ
  bash deploy.sh planet                    �����ͻ��� Planet
  bash deploy.sh backup                    �����������ݡ����硢Web ���ݺ�����
  bash deploy.sh reset-password            �����˺�Ϊ admin / admin ��Ҫ���״��޸�
  bash deploy.sh logs                      �鿴�����־����������
  bash deploy.sh uninstall                 �Ƴ��������������ú�ȫ�����ݾ�
  bash deploy.sh downloads                 ���� Docker �� GitHub ���ؼ���

����ֵ���״ΰ�װʾ����
  bash deploy.sh install --ip ��Ĺ���IP --zt-port 9993 --web-port 3443 --access public
  --ipv6 ��ַ                ͬʱ���� IPv6 Planet ��ַ
  --access public|local|proxy  ����ֱ�� / SSH ���� / ���� HTTPS �������
  --origin https://����       HTTPS ģʽ�ķ��ʵ�ַ
  --project-name ����         �״����ö����� Compose ��������
  --compose-file �ļ�         ׷�� Compose ���ã����ظ���
  --docker-registry ����       ��Ŀʹ�õ� Docker Hub ���ٲֿ�
  --github-proxy HTTPSǰ׺     GitHub Դ��Ͳֿ���٣�direct ��ʾֱ��
  update --skip-pull          ֻ���ݲ��ؽ���ǰԴ�룬����ȡ Git
���� .env ʱ���������ã��޸� IP / �˿��밴 README �� Planet �������̲�����
HELP
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ip|--ipv6|--zt-port|--web-port|--access|--origin|--project-name|--compose-file|--docker-registry|--github-proxy)
      [[ $# -ge 2 && -n "$2" ]] || fail "$1 ȱ��ֵ"
      case "$1" in
        --ip) IP="$2";; --ipv6) IPV6="$2";; --zt-port) ZT_PORT_OPTION="$2";;
        --web-port) WEB_PORT_OPTION="$2";; --access) ACCESS="$2";; --origin) ORIGIN="$2";;
        --project-name) PROJECT="$2";; --compose-file) EXTRA_COMPOSE+=(-f "$2");;
        --docker-registry) DOCKER_REGISTRY_OPTION="$2"; DOWNLOAD_OPTIONS=true;;
        --github-proxy) GITHUB_PROXY_OPTION="$2"; DOWNLOAD_OPTIONS=true;;
      esac
      shift 2;;
    --skip-pull) SKIP_PULL=true; shift;;
    --help|-h) usage; exit 0;;
    *) fail "δ֪������$1��ʹ�� bash deploy.sh help �鿴�÷���";;
  esac
done
[[ "$COMMAND" != help && "$COMMAND" != --help && "$COMMAND" != -h ]] || { usage; exit 0; }
case "$COMMAND" in menu|install|update|status|planet|backup|reset-password|logs|uninstall|downloads) ;; *) fail "δ֪������$COMMAND";; esac
[[ "$(uname -s)" == Linux ]] || fail '����ű���Ҫ�� Linux ���������С�'
[[ "$EUID" -eq 0 ]] || fail '��ʹ�� root�������� sudo bash deploy.sh��'
[[ "$ROOT" != *,* ]] || fail '��ĿĿ¼���ܰ������ţ�Docker ����·�����ƣ���'
# shellcheck source=deploy/downloads.sh
. "$ROOT/deploy/downloads.sh"

compose() { docker compose --project-directory "$ROOT" --env-file "$ROOT/.env" -f "$ROOT/compose.yaml" "${EXTRA_COMPOSE[@]}" "$@"; }
cleanup() {
  local code=$?
  if [[ ${#RESTART_AFTER_BACKUP[@]} -gt 0 ]]; then
    printf '\n���ڻָ�����ǰ���еķ��񡭡�\n' >&2
    compose start "${RESTART_AFTER_BACKUP[@]}" || true
  fi
  return "$code"
}
trap cleanup EXIT
trap 'printf "\n����ʧ�ܣ��ű��� %s �У����������ú������ѱ����������� bash deploy.sh logs �鿴������־��\n" "$LINENO" >&2' ERR
trap 'exit 130' INT
trap 'exit 143' TERM

install_docker() {
  local answer distro codename architecture package
  [[ -t 0 ]] || fail 'δ��װ Docker�����Ȱ�װ Docker Engine �� Compose ��������ԡ�'
  read -r -p 'δ��⵽ Docker���Ƿ�� Docker �ٷ�����Դ��װ��[y/N] ' answer
  [[ "$answer" == y || "$answer" == Y ]] || fail '��ȡ����Docker ��װ˵���� README��'
  # This is the operating system's file, never the project's .env.
  # shellcheck source=/dev/null
  . /etc/os-release
  distro="${ID:-}"; codename="${VERSION_CODENAME:-}"
  [[ "$distro" == debian || "$distro" == ubuntu ]] || fail '�Զ���װֻ֧�� Debian / Ubuntu������ϵͳ���Ȱ�װ Docker��'
  [[ "$codename" =~ ^[a-z]+$ ]] || fail '�޷�ʶ��ϵͳ�汾��'
  for package in docker.io docker-compose docker-doc docker-buildx podman-docker containerd runc; do
    if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q '^install ok installed$'; then
      fail "�������� $package �����������Ȱ� Docker �ٷ��ĵ�������װ��ͻ���ű������Ƴ�ϵͳ������"
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
    [[ "$COMMAND" == install || "$COMMAND" == menu ]] || fail '���Ȱ�װ Docker��'
    install_docker
  fi
  docker info >/dev/null 2>&1 || fail 'Docker ����δ���У���ǰ�û���Ȩ���� Docker��'
  docker compose version >/dev/null 2>&1 || fail '��Ҫ Docker Compose v2 ������밴 README ��װ��'
  local compose_help
  compose_help="$(docker compose up --help)"
  [[ "$compose_help" == *--wait-timeout* ]] || fail 'Compose �汾���ɣ������ Docker Compose �����'
}
web_image() {
  if ! docker image inspect zerotier-control:local >/dev/null 2>&1; then
    printf '׼�����𹤾ߣ��״���Ҫ���� Web ���񣩡���\n'
    docker build --build-arg "DOCKER_REGISTRY=$DOCKER_REGISTRY" -t zerotier-control:local .
  fi
}
pull_gateway() {
  local policy="${1:-missing}" attempt code
  # Fetch before creating/recreating containers. A failed pull is safe to retry.
  for attempt in 1 2 3; do
    printf '׼����ҳ��ھ��񣨵� %s/3 �Σ�����\n' "$attempt"
    if compose pull --policy "$policy" gateway; then return 0; else code=$?; fi
    if [[ "$code" -eq 130 || "$code" -eq 143 ]]; then return "$code"; fi
    if [[ "$attempt" -lt 3 ]]; then
      printf '������ȡʧ�ܣ�%s ������ԡ������ص����������Ḵ�á�\n' "$((attempt * 5))" >&2
      sleep "$((attempt * 5))"
    fi
  done
  fail '��ҳ��ھ������� 3 ����ȡʧ�ܡ����ú������ѱ��������� Docker �����硢��������Դ���ָ������� bash deploy.sh install ������'
}
helper() {
  docker run --rm --user 0:0 --network none --cap-drop ALL --cap-add DAC_OVERRIDE --cap-add FOWNER --security-opt no-new-privileges:true \
    --mount "type=bind,src=$ROOT,dst=/work" --workdir /work --entrypoint node \
    zerotier-control:local scripts/deploy-config.js "$@"
}
load_config() {
  [[ -f .env ]] || fail '��δ��װ���������� bash deploy.sh install��'
  web_image
  local values key value
  values="$(helper env)"
  # Read validated values as data. Never execute .env with source / eval.
  while IFS='=' read -r key value; do
    case "$key" in COMPOSE_PROJECT_NAME|PLANET_ENDPOINTS|ZT_PORT|WEB_PORT|WEB_BIND_ADDRESS|ADMIN_PASSWORD_PATH|PUBLIC_ORIGIN|COOKIE_SECURE)
      printf -v "$key" '%s' "$value"; export "${key?}";;
      *) fail '���ù��߷�����δ֪�ֶΡ�';;
    esac
  done <<< "$values"
  compose config --quiet
}
configure() {
  local detected='' answer
  if [[ -z "$IP" ]]; then
    [[ -t 0 ]] || fail '����ֵ�ذ�װ��Ҫ --ip ����IP��'
    if command -v curl >/dev/null 2>&1; then
      detected="$(curl --ipv4 --connect-timeout 3 --max-time 5 --fail --silent https://api.ipify.org || true)"
    fi
    read -r -p "���������� IPv4 / IPv6${detected:+ [$detected]}��" IP
    IP="${IP:-$detected}"
    read -r -p '���ӹ��� IPv6�������գ���' IPV6
    read -r -p 'ZeroTier UDP �˿� [9993]��' ZT_PORT_OPTION
    read -r -p 'Web �����˿� [3443]��' WEB_PORT_OPTION
    printf '\nWeb ���ʣ�1. ���� IP ֱ��  2. SSH ����  3. ���� HTTPS �������\n'
    read -r -p '��ѡ�� [1]��' answer
    case "${answer:-1}" in 1) ACCESS=public;; 2) ACCESS=local;; 3) ACCESS=proxy;; *) fail '���ʷ�ʽѡ�����';; esac
    if [[ "$ACCESS" == proxy ]]; then read -r -p 'HTTPS ���ʵ�ַ������ https://control.example.com����' ORIGIN; fi
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
  printf '�ͻ����ļ���%s/data/zerotier/dist/planet\n' "$ROOT"
  sha256sum data/zerotier/dist/planet
}
info() {
  compose ps
  printf '\nWeb ��ַ��%s\n�״ΰ�װ�����ú���˺ţ�admin / admin���״ε�¼�����޸��û��������롣\n�ɰ�����ʹ���û��� admin ��ԭ���������¼�����޸ĵ��˺ű����� Web ���ݾ��С�\nPlanet��%s/data/zerotier/dist/planet\nZeroTier ���У�UDP %s\n' "$PUBLIC_ORIGIN" "$ROOT" "$ZT_PORT"
  if [[ "$WEB_BIND_ADDRESS" == 127.0.0.1 && "$COOKIE_SECURE" == false ]]; then
    printf '�ڵ��Խ���������ssh -L %s:127.0.0.1:%s root@������IP\n' "$WEB_PORT" "$WEB_PORT"
  elif [[ "$COOKIE_SECURE" == true ]]; then
    printf '�뽫 HTTPS ������������������� 127.0.0.1:%s�������� Host��\n' "$WEB_PORT"
  else
    printf '��ҳ���У�TCP %s��HTTP ����δ���ܣ��ɰ� README ���� HTTPS��\n' "$WEB_PORT"
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
  printf '�������ݣ�%s������˽Կ�����룬Ŀ¼Ȩ�� 700������ܱ��ܣ�\n' "$directory"
}
install_stack() {
  web_image
  if [[ -f .env ]]; then
    [[ -z "$IP$IPV6$ZT_PORT_OPTION$WEB_PORT_OPTION$ACCESS$ORIGIN$PROJECT" ]] || fail '�Ѵ��� .env���ܾ��ð�װ�������Ǽ������ã���ֱ������ install �������á�'
    printf '��⵽�������ã����������ݡ�Planet��������������ݡ�\n'
  else configure; fi
  load_config
  helper password
  pull_gateway
  printf '���������� ZeroTier��Planet ���� Web���״α��������Ҫ�����ӡ���\n'
  compose up -d --build --pull never --wait --wait-timeout 180
  export_planet
  info
}
update_stack() {
  load_config
  if [[ "$SKIP_PULL" == false ]]; then
    command -v git >/dev/null 2>&1 || fail '��Ҫ Git������Դ��ʹ�� update --skip-pull��'
    git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail '��ǰĿ¼���� Git �ֿ⣻ʹ�� update --skip-pull �ؽ����ص�Դ�롣'
    if ! git diff --quiet || ! git diff --cached --quiet; then fail '��δ�ύ��Դ���޸ģ����ȱ����޸ģ����²��Ḳ�����ǡ�'; fi
  fi
  backup
  if [[ "$SKIP_PULL" == false ]]; then pull_project; fi
  pull_gateway always
  compose build --pull
  compose up -d --force-recreate --pull never --wait --wait-timeout 180
  export_planet
  info
}
reset_password() {
  pull_gateway
  compose build control
  backup
  compose stop control
  helper password --reset
  compose run --rm --no-deps --entrypoint node control scripts/reset-account.js
  # Recreate bind mounts because resetting the file uses an atomic rename.
  compose up -d --force-recreate --pull never --wait --wait-timeout 180 control gateway
  printf '�����˺�������Ϊ admin / admin���ɻỰ��ʧЧ����¼������޸����\n'
  info
}
menu() {
  local selection
  printf '\nZeroTier Control �� ˽�� Planet + �°� ZeroTier + ���� Web\n\n'
  printf '1. ��װ / ����\n2. ���ݲ�����\n3. �鿴��Ϣ\n4. ���� Planet\n5. ��������\n6. ���ù����˺�\n7. �鿴��־\n8. �Ƴ�����������ȫ�����ݣ�\n9. �������ؼ���\n0. �˳�\n\n'
  read -r -p '��ѡ�������' selection
  case "$selection" in 1) COMMAND=install;; 2) COMMAND=update;; 3) COMMAND=status;; 4) COMMAND=planet;; 5) COMMAND=backup;; 6) COMMAND=reset-password;; 7) COMMAND=logs;; 8) COMMAND=uninstall;; 9) COMMAND=downloads;; 0) exit 0;; *) fail '������ 0�C9��';; esac
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
      uninstall) compose down; printf '�������Ƴ������á���������ݾ��ѱ��������� install �ɻָ���\n';;
    esac;;
esac
