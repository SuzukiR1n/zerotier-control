#!/usr/bin/env bash
# CI-only wrapper. Forward commands except the injected image pull/inspect faults.
set -euo pipefail
state=/tmp/zt-control-ci/pull-fault
if [[ "${1:-}" == pull && "${2:-}" == 127.0.0.1:5001/library/node:* ]]; then
  printf 'attempt\n' >> "$state/primary-attempts"
fi
if [[ "${1:-} ${2:-}" == 'image inspect' && "${3:-}" == */library/nginx:stable-alpine && -f "$state/permanent" ]]; then
  exit 1
fi
if [[ "${1:-}" == pull && "${2:-}" == */library/nginx:stable-alpine ]]; then
  count=0
  if [[ -f "$state/attempts" ]]; then read -r count < "$state/attempts"; fi
  count=$((count + 1))
  printf '%s\n' "$count" > "$state/attempts"
  if [[ -f "$state/permanent" || "$count" -lt 3 ]]; then
    printf 'short read: expected 1396 bytes but got 0: unexpected EOF (CI injected fault)\n' >&2
    exit 29
  fi
fi
exec /usr/bin/docker "$@"
