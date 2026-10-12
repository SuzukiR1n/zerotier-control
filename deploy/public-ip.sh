#!/usr/bin/env bash
# Called only during interactive first-time configuration; never replaces an existing Planet endpoint.
detect_public_ip() {
  local family url candidate client=''
  if command -v curl >/dev/null 2>&1; then client=curl;
  elif command -v wget >/dev/null 2>&1; then client=wget;
  else return 1; fi
  for family in 4 6; do
    local sources=(https://api.ipify.org https://icanhazip.com)
    if [[ "$family" == 6 ]]; then sources=(https://api6.ipify.org https://icanhazip.com); fi
    for url in "${sources[@]}"; do
      if [[ "$client" == curl ]]; then
        candidate="$(curl "-$family" --noproxy '*' --proto '=https' --connect-timeout 3 --max-time 5 --max-filesize 64 --fail --silent "$url" 2>/dev/null)" || continue
      else
        candidate="$(wget "-$family" --no-proxy --timeout=5 --tries=1 -q -O - "$url" 2>/dev/null)" || continue
      fi
      [[ ${#candidate} -le 45 ]] || continue
      if candidate="$(helper detected-ip "$candidate" "$family" 2>/dev/null)"; then
        printf '%s\n' "$candidate"
        return 0
      fi
    done
  done
  return 1
}
choose_public_ip() {
  local detected='' answer
  printf '正在自动检测公网 IP……\n'
  if detected="$(detect_public_ip)"; then
    printf '检测到公网 IP：%s\n' "$detected"
    while true; do
      read -r -p '是否使用此公网 IP？[Y/n] ' answer || return 1
      case "$answer" in
        ''|y|Y|yes|YES) IP="$detected"; return 0;;
        n|N|no|NO) break;;
        *) printf '请输入 y 使用检测结果，或 n 手动填写。\n';;
      esac
    done
  else
    printf '未能自动获取公网 IP，请手动填写。\n'
  fi
  read -r -p '服务器公网 IPv4 / IPv6：' IP || return 1
  [[ -n "$IP" ]] || { printf '公网 IP 不能为空。\n' >&2; return 1; }
}
