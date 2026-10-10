#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=deploy/downloads.sh
. deploy/downloads.sh
ROOT="$(mktemp -d)"
trap 'rm -rf -- "$ROOT"' EXIT
fail() { printf '%s\n' "$*" >&2; exit 22; }
DOCKER_REGISTRY='' GITHUB_PROXY='' DOWNLOAD_OPTIONS=true
DOCKER_REGISTRY_OPTION='' GITHUB_PROXY_OPTION=''
DOCKER_FALLBACKS_OPTION=''
download_config
[[ "$DOCKER_REGISTRY" == docker.io && "$DOCKER_REGISTRY_FALLBACKS" == none && -z "$GITHUB_PROXY" ]]
DOCKER_REGISTRY=https://registry.example.com/
GITHUB_PROXY=https://proxy.example.com
configure_downloads
DOCKER_REGISTRY=unused GITHUB_PROXY=unused
download_config
[[ "$DOCKER_REGISTRY" == registry.example.com && "$GITHUB_PROXY" == https://proxy.example.com/ ]]
[[ "$(stat -c %a "$ROOT/.download.env")" == 600 ]]
GITHUB_PROXY_OPTION=direct
download_options
[[ -z "$GITHUB_PROXY" ]]
# Old public-mirror profiles gain automatic fallback; private registries stay scoped.
printf 'DOCKER_REGISTRY=docker.1panel.dev\nGITHUB_PROXY=\n' > "$ROOT/.download.env"
DOCKER_REGISTRY_FALLBACKS=''
download_config
[[ "$DOCKER_REGISTRY_FALLBACKS" == auto ]]
registry_candidates
[[ "${REGISTRY_CANDIDATES[*]}" == 'docker.1panel.dev docker.1ms.run docker.m.daocloud.io dockerproxy.net dockerproxy.link' ]]
DOCKER_REGISTRY_OPTION=private.example.com DOCKER_FALLBACKS_OPTION=''
download_options
[[ "$DOCKER_REGISTRY_FALLBACKS" == none ]]
DOCKER_FALLBACKS_OPTION=private.example.com,backup.example.com:5000,backup.example.com:5000
download_options
registry_candidates
[[ "${REGISTRY_CANDIDATES[*]}" == 'private.example.com backup.example.com:5000' ]]
# shellcheck disable=SC2016
for invalid in ',host' 'host,' 'host,,other' 'host,https://other' 'host,user:pass@other' 'host,other/path' 'host, other' '$(touch injected)'; do
  if ( DOCKER_REGISTRY_FALLBACKS="$invalid"; validate_download_config ); then fail 'Invalid fallback list was accepted'; fi
done
# These payloads must stay literal; expanding them would defeat the injection test.
# shellcheck disable=SC2016
for invalid in 'http://registry.example.com' 'user:password@host' 'host/library' '$(touch injected)'; do
  if ( DOCKER_REGISTRY="$invalid"; validate_download_config ); then fail 'Invalid registry was accepted'; fi
done
# shellcheck disable=SC2016
for invalid in 'http://proxy.example.com' 'https://user:pass@host' 'https://host?token=x' '$(touch injected)'; do
  if ( GITHUB_PROXY="$invalid"; validate_download_config ); then fail 'Invalid proxy was accepted'; fi
done
# shellcheck disable=SC2016
printf 'DOCKER_REGISTRY=$(touch %s/injected)\nGITHUB_PROXY=\n' "$ROOT" > "$ROOT/.download.env"
if (download_config); then fail 'Unsafe download config was accepted'; fi
[[ ! -e "$ROOT/injected" ]]
DOCKER_REGISTRY=docker.io GITHUB_PROXY=https://proxy.example.com/
git() {
  if [[ "$1" == remote ]]; then printf 'https://github.com/SuzukiR1n/zerotier-control.git\n';
  else printf '%s\n' "$@" > "$ROOT/git-arguments"; fi
}
pull_project
grep -Fx 'url.https://proxy.example.com/https://github.com/.insteadOf=https://github.com/' "$ROOT/git-arguments"
grep -Fx -- '--ff-only' "$ROOT/git-arguments"
printf 'Download config validation, persistence and scoped Git acceleration passed.\n'
