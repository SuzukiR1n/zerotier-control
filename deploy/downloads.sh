# shellcheck shell=bash
# Shared by deploy.sh and shell tests. Configuration is read as data, never eval.
download_config() {
  DOCKER_REGISTRY="${DOCKER_REGISTRY:-docker.io}"
  DOCKER_REGISTRY_FALLBACKS="${DOCKER_REGISTRY_FALLBACKS:-}"
  GITHUB_PROXY="${GITHUB_PROXY:-}"
  if [[ -f "$ROOT/.download.env" ]]; then
    local key value
    while IFS='=' read -r key value || [[ -n "$key" ]]; do
      [[ -n "$key" && "$key" != \#* ]] || continue
      case "$key" in
        DOCKER_REGISTRY) DOCKER_REGISTRY="$value";;
        DOCKER_REGISTRY_FALLBACKS) DOCKER_REGISTRY_FALLBACKS="$value";;
        GITHUB_PROXY) GITHUB_PROXY="$value";;
        *) fail '.download.env 只能配置 DOCKER_REGISTRY、DOCKER_REGISTRY_FALLBACKS 和 GITHUB_PROXY。';;
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
  if [[ -z "$DOCKER_REGISTRY_FALLBACKS" ]]; then
    case "$DOCKER_REGISTRY" in
      docker.1panel.dev|docker.1ms.run|docker.m.daocloud.io|dockerproxy.net|dockerproxy.link) DOCKER_REGISTRY_FALLBACKS=auto;;
      *) DOCKER_REGISTRY_FALLBACKS=none;;
    esac
  fi
  case "$DOCKER_REGISTRY_FALLBACKS" in
    auto|none) ;;
    *)
      [[ "$DOCKER_REGISTRY_FALLBACKS" != ,* && "$DOCKER_REGISTRY_FALLBACKS" != *, && "$DOCKER_REGISTRY_FALLBACKS" != *,,* ]] || fail '候补镜像源须为逗号分隔的域名列表。'
      local registry
      local -a fallbacks
      IFS=',' read -r -a fallbacks <<< "$DOCKER_REGISTRY_FALLBACKS"
      for registry in "${fallbacks[@]}"; do
        [[ "$registry" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*(:[0-9]{1,5})?$ ]] || fail '候补镜像源不能包含凭据、URL 前缀、路径或空格。'
      done;;
  esac
  if [[ -n "$GITHUB_PROXY" ]]; then
    [[ "$GITHUB_PROXY" =~ ^https://[a-zA-Z0-9][a-zA-Z0-9.-]*(:[0-9]{1,5})?(/[a-zA-Z0-9._~/-]*)?$ ]] || fail 'GitHub 加速地址须为 HTTPS URL 前缀，不能包含账号、密码、查询参数或空格。'
    GITHUB_PROXY="${GITHUB_PROXY%/}/"
  fi
  export DOCKER_REGISTRY DOCKER_REGISTRY_FALLBACKS GITHUB_PROXY
}
configure_downloads() {
  if [[ "$DOWNLOAD_OPTIONS" == false ]]; then
    [[ -t 0 ]] || fail '无人值守配置需要 --docker-registry 与 --github-proxy 参数（留空 GitHub 代理使用 --github-proxy direct）。'
    printf '\n选择下载线路：\n1. 公开加速源（多个 Docker 源自动切换 / GH-Proxy）\n2. 自定义\n3. 官方直连\n'
    local answer
    read -r -p '请选择 [1]：' answer
    case "${answer:-1}" in
      1) DOCKER_REGISTRY=docker.1ms.run; DOCKER_REGISTRY_FALLBACKS=auto; GITHUB_PROXY=https://gh-proxy.org/;;
      2)
        read -r -p 'Docker 加速域名（如 registry.example.com；官方填 docker.io）：' DOCKER_REGISTRY
        read -r -p '候补 Docker 域名（逗号分隔；留空不自动切换）：' DOCKER_REGISTRY_FALLBACKS
        DOCKER_REGISTRY_FALLBACKS="${DOCKER_REGISTRY_FALLBACKS:-none}"
        read -r -p 'GitHub 加速 URL 前缀（留空为直连）：' GITHUB_PROXY;;
      3) DOCKER_REGISTRY=docker.io; DOCKER_REGISTRY_FALLBACKS=none; GITHUB_PROXY='';;
      *) fail '请选择 1–3。';;
    esac
  fi
  validate_download_config
  save_download_config
  printf '下载线路已保存到 .download.env。Docker：%s；候补：%s；GitHub：%s\n' "$DOCKER_REGISTRY" "$DOCKER_REGISTRY_FALLBACKS" "${GITHUB_PROXY:-官方直连}"
}
save_download_config() {
  local temporary
  temporary="$(mktemp "$ROOT/.download.env.XXXXXX")"
  printf 'DOCKER_REGISTRY=%s\nDOCKER_REGISTRY_FALLBACKS=%s\nGITHUB_PROXY=%s\n' "$DOCKER_REGISTRY" "$DOCKER_REGISTRY_FALLBACKS" "$GITHUB_PROXY" > "$temporary"
  chmod 600 "$temporary"
  mv "$temporary" "$ROOT/.download.env"
}
download_options() {
  if [[ -n "$DOCKER_REGISTRY_OPTION" ]]; then DOCKER_REGISTRY="$DOCKER_REGISTRY_OPTION"; DOCKER_REGISTRY_FALLBACKS=''; fi
  [[ -z "$DOCKER_FALLBACKS_OPTION" ]] || DOCKER_REGISTRY_FALLBACKS="$DOCKER_FALLBACKS_OPTION"
  if [[ "$GITHUB_PROXY_OPTION" == direct ]]; then GITHUB_PROXY='';
  elif [[ -n "$GITHUB_PROXY_OPTION" ]]; then GITHUB_PROXY="$GITHUB_PROXY_OPTION"; fi
  validate_download_config
}
registry_candidates() {
  local registry
  local -a extra=()
  local -A seen=()
  case "$DOCKER_REGISTRY_FALLBACKS" in
    auto) extra=(docker.1ms.run docker.1panel.dev docker.m.daocloud.io dockerproxy.net dockerproxy.link);;
    none) ;;
    *) IFS=',' read -r -a extra <<< "$DOCKER_REGISTRY_FALLBACKS";;
  esac
  REGISTRY_CANDIDATES=()
  for registry in "$DOCKER_REGISTRY" "${extra[@]}"; do
    [[ -z "${seen[$registry]:-}" ]] || continue
    seen[$registry]=1
    REGISTRY_CANDIDATES+=("$registry")
  done
}
prepare_images() {
  local policy="$1" original="$DOCKER_REGISTRY" registry image reference attempt code ready
  shift
  registry_candidates
  for registry in "${REGISTRY_CANDIDATES[@]}"; do
    printf '\n检查 Docker 下载线路：%s\n' "$registry"
    ready=true
    for image in "$@"; do
      reference="$registry/library/$image"
      if [[ "$policy" == missing ]] && docker image inspect "$reference" >/dev/null 2>&1; then continue; fi
      code=0
      for attempt in 1 2 3; do
        printf '准备镜像 %s（第 %s/3 次）……\n' "$reference" "$attempt"
        if docker pull "$reference"; then code=0; break; else code=$?; fi
        if [[ "$code" -eq 130 || "$code" -eq 143 ]]; then return "$code"; fi
        if [[ "$attempt" -lt 3 ]]; then
          printf '镜像拉取失败，%s 秒后重试。\n' "$((attempt * 5))" >&2
          sleep "$((attempt * 5))"
        fi
      done
      if [[ "$code" -ne 0 ]]; then ready=false; break; fi
    done
    if [[ "$ready" == true ]]; then
      DOCKER_REGISTRY="$registry"
      export DOCKER_REGISTRY
      if [[ "$registry" != "$original" ]]; then
        save_download_config
        printf '已切换并保存可用 Docker 线路：%s\n' "$registry"
      fi
      return 0
    fi
    printf 'Docker 线路 %s 下载失败，尝试候补线路。\n' "$registry" >&2
  done
  fail '所有已配置的 Docker 线路都未能取得完整镜像。配置和数据已保留，请更换下载线路后运行 bash deploy.sh install。'
}
prepare_project_pull() {
  PROJECT_PULL_ARGUMENTS=(pull --ff-only)
  if [[ -n "$GITHUB_PROXY" ]]; then
    # get-url expands insteadOf; validate the stored URL before applying our own rewrite.
    local origin address target resolved
    origin="$(git config --get remote.origin.url)" || fail '未配置 origin；请先设置项目的 GitHub 仓库地址。'
    address="${origin%/}"
    if [[ "$address" == "${GITHUB_PROXY}https://github.com/"* ]]; then
      address="${address#"$GITHUB_PROXY"}"
    elif [[ "$address" == https://gh-proxy.org/https://github.com/* ]]; then
      address="${address#https://gh-proxy.org/}"
    fi
    case "$address" in
      git@github.com:*) address="https://github.com/${address#git@github.com:}";;
      ssh://git@github.com/*) address="https://github.com/${address#ssh://git@github.com/}";;
      ssh://git@github.com:22/*) address="https://github.com/${address#ssh://git@github.com:22/}";;
    esac
    [[ "$address" =~ ^https://github.com/([a-zA-Z0-9_.-]+)/([a-zA-Z0-9_.-]+)$ ]] || fail '无法识别公开 GitHub origin。支持官方 HTTPS、GitHub SSH 和已配置的代理前缀；地址不能包含密码或 Token。请按 README 的更新失败恢复步骤操作。'
    [[ "${BASH_REMATCH[1]}" != . && "${BASH_REMATCH[1]}" != .. && "${BASH_REMATCH[2]}" != . && "${BASH_REMATCH[2]}" != .. ]] || fail 'GitHub 仓库路径无效。'
    target="${GITHUB_PROXY}${address}"
    # An exact URL prefix takes precedence over a broader global insteadOf rule.
    # Keep origin and branch tracking unchanged; do not double-prefix proxy clones.
    PROJECT_PULL_ARGUMENTS=(-c "url.${target}.insteadOf=${origin}" pull --ff-only)
    resolved="$(git "${PROJECT_PULL_ARGUMENTS[@]:0:2}" remote get-url origin)"
    [[ "$resolved" == "$target" ]] || fail 'Git 地址改写与下载线路冲突。请按 README 的更新失败恢复步骤操作。'
  fi
}
pull_project() {
  prepare_project_pull
  git "${PROJECT_PULL_ARGUMENTS[@]}"
}
