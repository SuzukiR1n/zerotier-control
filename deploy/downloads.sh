# shellcheck shell=bash
# Shared by deploy.sh and shell tests. Configuration is read as data, never eval.
download_config() {
  DOCKER_REGISTRY="${DOCKER_REGISTRY:-docker.io}"
  GITHUB_PROXY="${GITHUB_PROXY:-}"
  if [[ -f "$ROOT/.download.env" ]]; then
    local key value
    while IFS='=' read -r key value || [[ -n "$key" ]]; do
      [[ -n "$key" && "$key" != \#* ]] || continue
      case "$key" in
        DOCKER_REGISTRY) DOCKER_REGISTRY="$value";;
        GITHUB_PROXY) GITHUB_PROXY="$value";;
        *) fail '.download.env 只能配置 DOCKER_REGISTRY 和 GITHUB_PROXY。';;
      esac
    done < "$ROOT/.download.env"
  fi
  validate_download_config
}
validate_download_config() {
  # Use a registry hostname directly for pull and every FROM, including BuildKit.
  DOCKER_REGISTRY="${DOCKER_REGISTRY#https://}"
  DOCKER_REGISTRY="${DOCKER_REGISTRY%/}"
  [[ "$DOCKER_REGISTRY" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*(:[0-9]{1,5})?$ ]] || fail 'Docker 加速地址须为域名[:端口]，不能包含账号、路径或 HTTP 前缀。'
  if [[ -n "$GITHUB_PROXY" ]]; then
    [[ "$GITHUB_PROXY" =~ ^https://[a-zA-Z0-9][a-zA-Z0-9.-]*(:[0-9]{1,5})?(/[a-zA-Z0-9._~/-]*)?$ ]] || fail 'GitHub 加速地址须为 HTTPS URL 前缀，不能包含账号、密码、查询参数或空格。'
    GITHUB_PROXY="${GITHUB_PROXY%/}/"
  fi
  export DOCKER_REGISTRY GITHUB_PROXY
}
configure_downloads() {
  if [[ "$DOWNLOAD_OPTIONS" == false ]]; then
    [[ -t 0 ]] || fail '无人值守配置需要 --docker-registry 与 --github-proxy 参数（留空 GitHub 代理使用 --github-proxy direct）。'
    printf '\n选择下载线路：\n1. 公开加速源（1Panel Docker / GH-Proxy）\n2. 自定义\n3. 官方直连\n'
    local answer
    read -r -p '请选择 [1]：' answer
    case "${answer:-1}" in
      1) DOCKER_REGISTRY=docker.1panel.dev; GITHUB_PROXY=https://gh-proxy.org/;;
      2)
        read -r -p 'Docker 加速域名（如 registry.example.com；官方填 docker.io）：' DOCKER_REGISTRY
        read -r -p 'GitHub 加速 URL 前缀（留空为直连）：' GITHUB_PROXY;;
      3) DOCKER_REGISTRY=docker.io; GITHUB_PROXY='';;
      *) fail '请选择 1–3。';;
    esac
  fi
  validate_download_config
  local temporary
  temporary="$(mktemp "$ROOT/.download.env.XXXXXX")"
  printf 'DOCKER_REGISTRY=%s\nGITHUB_PROXY=%s\n' "$DOCKER_REGISTRY" "$GITHUB_PROXY" > "$temporary"
  chmod 600 "$temporary"
  mv "$temporary" "$ROOT/.download.env"
  printf '下载线路已保存到 .download.env。Docker：%s；GitHub：%s\n' "$DOCKER_REGISTRY" "${GITHUB_PROXY:-官方直连}"
}
download_options() {
  [[ -z "$DOCKER_REGISTRY_OPTION" ]] || DOCKER_REGISTRY="$DOCKER_REGISTRY_OPTION"
  if [[ "$GITHUB_PROXY_OPTION" == direct ]]; then GITHUB_PROXY='';
  elif [[ -n "$GITHUB_PROXY_OPTION" ]]; then GITHUB_PROXY="$GITHUB_PROXY_OPTION"; fi
  validate_download_config
}
pull_project() {
  if [[ -n "$GITHUB_PROXY" ]]; then
    # Applies only to this invocation, not global Git settings or credentials.
    local origin
    origin="$(git remote get-url origin)"
    [[ "$origin" =~ ^https://github.com/[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$ ]] || fail '仓库加速仅用于不带凭据的公开 GitHub HTTPS 地址。请使用官方 origin，或选择 GitHub 直连。'
    git -c "url.${GITHUB_PROXY}https://github.com/.insteadOf=https://github.com/" pull --ff-only
  else git pull --ff-only; fi
}
