#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=deploy/downloads.sh
. deploy/downloads.sh
TEST_TEMP_BASE="$(cd -- "${TMPDIR:-/tmp}" && pwd -P)"
ROOT="$(mktemp -d "$TEST_TEMP_BASE/zt-git-download.XXXXXX")"
trap '[[ "$ROOT" == "$TEST_TEMP_BASE"/zt-git-download.* ]] && rm -rf -- "$ROOT"' EXIT
fail() { printf '%s\n' "$*" >&2; exit 22; }
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL="$ROOT/global.config"
: > "$GIT_CONFIG_GLOBAL"
# Use real Git for reading/rewrite checks; intercept only the final network pull.
git() {
  if [[ "$1" == pull || ( "$1" == -c && "${3:-}" == pull ) ]]; then
    printf '%s\n' "$@" > "$ROOT/pull-arguments"
  else command git "$@"; fi
}
command git init -q "$ROOT/repo"
cd "$ROOT/repo"
command git remote add origin https://github.com/SuzukiR1n/zerotier-control.git
# This fixture is the only global configuration file Git reads during the test.
command git config --global url.https://old-proxy.example/https://github.com/.insteadOf https://github.com/
GITHUB_PROXY=https://proxy.example.com/
for address in \
  https://github.com/SuzukiR1n/zerotier-control.git \
  https://github.com/SuzukiR1n/zerotier-control \
  https://github.com/SuzukiR1n/zerotier-control.git/ \
  https://proxy.example.com/https://github.com/SuzukiR1n/zerotier-control.git \
  https://gh-proxy.org/https://github.com/SuzukiR1n/zerotier-control.git \
  git@github.com:SuzukiR1n/zerotier-control.git \
  ssh://git@github.com/SuzukiR1n/zerotier-control.git \
  ssh://git@github.com:22/SuzukiR1n/zerotier-control.git; do
  command git remote set-url origin "$address"
  prepare_project_pull
  expected=https://proxy.example.com/https://github.com/SuzukiR1n/zerotier-control.git
  [[ "$address" != https://github.com/SuzukiR1n/zerotier-control ]] || expected=${expected%.git}
  [[ "$(command git "${PROJECT_PULL_ARGUMENTS[@]:0:2}" remote get-url origin)" == "$expected" ]]
  pull_project
  grep -Fx -- '--ff-only' "$ROOT/pull-arguments" >/dev/null
  grep -Fx "url.${expected}.insteadOf=${address}" "$ROOT/pull-arguments" >/dev/null
  [[ "$(command git config --get remote.origin.url)" == "$address" ]]
done
[[ "$(command git config --global --get url.https://old-proxy.example/https://github.com/.insteadOf)" == https://github.com/ ]]
# Reject credentials, arbitrary mirror hosts and shell payloads before any pull.
# shellcheck disable=SC2016
for address in \
  https://user:password@github.com/SuzukiR1n/zerotier-control.git \
  https://github.com/SuzukiR1n/zerotier-control.git?token=secret \
  https://unknown-proxy.example/https://github.com/SuzukiR1n/zerotier-control.git \
  git@other.example:SuzukiR1n/zerotier-control.git \
  ssh://password@github.com/SuzukiR1n/zerotier-control.git \
  'https://github.com/../zerotier-control' \
  '$(touch injected)'; do
  command git remote set-url origin "$address"
  before="$(cat "$ROOT/pull-arguments")"
  if (pull_project); then fail 'Unsafe origin was accepted'; fi
  [[ "$(cat "$ROOT/pull-arguments")" == "$before" ]]
done
[[ ! -e injected ]]
GITHUB_PROXY=''
pull_project
[[ "$(cat "$ROOT/pull-arguments")" == $'pull\n--ff-only' ]]
printf 'Git origin formats, global rewrite precedence and unchanged remote configuration passed.\n'
