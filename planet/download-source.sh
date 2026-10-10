#!/bin/sh
# Mirrors may change transport; the pinned archive SHA-256 remains mandatory.
set -eu
commit="${1:?source commit required}"
checksum="${2:?source checksum required}"
output="${3:?output path required}"
case "$commit" in *[!a-f0-9]*|'') echo 'Invalid source commit' >&2; exit 1;; esac
case "$checksum" in *[!a-f0-9]*|'') echo 'Invalid source checksum' >&2; exit 1;; esac
[ "${#commit}" -eq 40 ] || exit 1
[ "${#checksum}" -eq 64 ] || exit 1
source_url="https://codeload.github.com/zerotier/ZeroTierOne/tar.gz/$commit"
if [ -n "${GITHUB_PROXY:-}" ]; then
  source_url="${GITHUB_PROXY%/}/https://github.com/zerotier/ZeroTierOne/archive/$commit.tar.gz"
fi
temporary="$output.part"
trap 'rm -f "$temporary"' EXIT
curl --fail --location --connect-timeout 15 --max-time 300 --speed-time 30 --speed-limit 1024 \
  --retry 3 --retry-delay 3 --retry-all-errors "$source_url" -o "$temporary"
if ! printf '%s  %s\n' "$checksum" "$temporary" | sha256sum -c -; then
  echo 'ZeroTier source checksum mismatch. The mirror returned unexpected content; compilation stopped.' >&2
  exit 1
fi
mv "$temporary" "$output"
