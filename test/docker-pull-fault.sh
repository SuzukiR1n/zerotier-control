#!/usr/bin/env bash
# CI-only wrapper. Forward every command except the injected gateway pull fault.
set -euo pipefail
state=/tmp/zt-control-ci/pull-fault
if [[ " $* " == *' pull --policy missing gateway '* ]]; then
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
