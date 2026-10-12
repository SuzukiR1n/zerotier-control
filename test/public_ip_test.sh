#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=deploy/public-ip.sh
. deploy/public-ip.sh
TEST_TEMP_BASE="$(cd -- "${TMPDIR:-/tmp}" && pwd -P)"
TEST_ROOT="$(mktemp -d "$TEST_TEMP_BASE/zt-public-ip.XXXXXX")"
trap '[[ "$TEST_ROOT" == "$TEST_TEMP_BASE"/zt-public-ip.* ]] && rm -rf -- "$TEST_ROOT"' EXIT
MODE=primary IP='' USE_WGET=false
command() {
  if [[ "$USE_WGET" == true && "$1" == -v && "$2" == curl ]]; then return 1; fi
  builtin command "$@"
}
helper() {
  [[ "$1" == detected-ip ]]
  case "$2:$3" in 8.8.8.8:4|1.1.1.1:4|2001:4860:4860::8888:6) printf '%s\n' "$2";; *) return 1;; esac
}
curl() {
  printf '%s\n' "$*" >> "$TEST_ROOT/requests"
  case "$MODE:$1:$*" in
    primary:-4:*) printf '8.8.8.8\n';;
    fallback:-4:*https://icanhazip.com) printf '1.1.1.1\n';;
    ipv6:-6:*) printf '2001:4860:4860::8888\n';;
    invalid:-4:*https://api.ipify.org) printf '<html>error</html>\n';;
    invalid:-4:*https://icanhazip.com) printf '1.1.1.1\n';;
    *) return 28;;
  esac
}
wget() { printf '%s\n' "$*" >> "$TEST_ROOT/requests"; printf '8.8.8.8\n'; }
[[ "$(detect_public_ip)" == 8.8.8.8 ]]
MODE=fallback
[[ "$(detect_public_ip)" == 1.1.1.1 ]]
MODE=ipv6
[[ "$(detect_public_ip)" == 2001:4860:4860::8888 ]]
MODE=invalid
[[ "$(detect_public_ip)" == 1.1.1.1 ]]
MODE=primary
choose_public_ip <<< '' > "$TEST_ROOT/output"
[[ "$IP" == 8.8.8.8 ]]
choose_public_ip <<< $'n\n1.1.1.1' > "$TEST_ROOT/output"
[[ "$IP" == 1.1.1.1 ]]
choose_public_ip <<< $'invalid\ny' > "$TEST_ROOT/output"
[[ "$IP" == 8.8.8.8 ]]
IP=''
if choose_public_ip </dev/null > "$TEST_ROOT/output"; then exit 1; fi
[[ -z "$IP" ]]
MODE=offline
choose_public_ip <<< '1.1.1.1' > "$TEST_ROOT/output"
[[ "$IP" == 1.1.1.1 ]]
USE_WGET=true
[[ "$(detect_public_ip)" == 8.8.8.8 ]]
grep -Fq -- "--noproxy * --proto =https --connect-timeout 3 --max-time 5 --max-filesize 64" "$TEST_ROOT/requests"
grep -Fq -- '--no-proxy --timeout=5 --tries=1' "$TEST_ROOT/requests"
printf 'Public IP fallback, IPv6, validation, confirmation, manual override, EOF cancellation and wget fallback passed.\n'
