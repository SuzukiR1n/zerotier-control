#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=deploy/downloads.sh
. deploy/downloads.sh
ROOT="$(mktemp -d)"
trap 'rm -rf -- "$ROOT"' EXIT
fail() { printf '%s\n' "$*" >&2; exit 22; }
sleep() { :; }
scenario=''
docker() {
  if [[ "$1 $2" == 'image inspect' ]]; then
    [[ "$scenario" == cached ]]
    return
  fi
  [[ "$1" == pull ]] || fail 'Unexpected Docker command'
  printf '%s\n' "$2" >> "$ROOT/pulls"
  case "$scenario" in
    fallback) [[ "$2" == good.example.com/* ]];;
    partial) [[ "$2" != primary.example.com/* && "$2" != partial.example.com/library/python:* ]];;
    failed) return 29;;
    interrupt) return 130;;
    terminate) return 143;;
    cached|refresh) return 0;;
    *) fail 'Unexpected test scenario';;
  esac
}
configure_test() {
  scenario="$1"
  DOCKER_REGISTRY=primary.example.com
  DOCKER_REGISTRY_FALLBACKS="$2"
  GITHUB_PROXY=https://proxy.example.com/
  validate_download_config
  save_download_config
  cp "$ROOT/.download.env" "$ROOT/original"
  : > "$ROOT/pulls"
}
configure_test fallback good.example.com
prepare_images missing node:24-bookworm-slim debian:bookworm-slim python:3.13-slim-bookworm nginx:stable-alpine
[[ "$DOCKER_REGISTRY" == good.example.com ]]
[[ "$(wc -l < "$ROOT/pulls")" -eq 7 ]]
grep -Fx 'DOCKER_REGISTRY=good.example.com' "$ROOT/.download.env"
grep -Fx 'GITHUB_PROXY=https://proxy.example.com/' "$ROOT/.download.env"
configure_test partial partial.example.com,good.example.com
prepare_images missing node:24-bookworm-slim debian:bookworm-slim python:3.13-slim-bookworm nginx:stable-alpine
[[ "$DOCKER_REGISTRY" == good.example.com ]]
[[ "$(wc -l < "$ROOT/pulls")" -eq 12 ]]
if grep -Fx 'partial.example.com/library/nginx:stable-alpine' "$ROOT/pulls"; then fail 'An incomplete source must stop before the next image'; fi
configure_test failed good.example.com
if (prepare_images missing nginx:stable-alpine); then fail 'All failed sources must stop deployment'; fi
cmp "$ROOT/.download.env" "$ROOT/original"
[[ "$DOCKER_REGISTRY" == primary.example.com && "$(wc -l < "$ROOT/pulls")" -eq 6 ]]
for scenario_name in interrupt terminate; do
  configure_test "$scenario_name" good.example.com
  if prepare_images missing node:24-bookworm-slim; then fail 'Cancellation must stop deployment'; else code=$?; fi
  if [[ "$scenario_name" == interrupt ]]; then [[ "$code" -eq 130 ]]; else [[ "$code" -eq 143 ]]; fi
  [[ "$(wc -l < "$ROOT/pulls")" -eq 1 && "$DOCKER_REGISTRY" == primary.example.com ]]
  cmp "$ROOT/.download.env" "$ROOT/original"
done
configure_test cached none
prepare_images missing node:24-bookworm-slim nginx:stable-alpine
[[ ! -s "$ROOT/pulls" ]]
prepare_images always node:24-bookworm-slim nginx:stable-alpine
[[ "$(wc -l < "$ROOT/pulls")" -eq 2 ]]
printf 'Image fallback, complete-image preflight, cache policy, cancellation and failure preservation passed.\n'
