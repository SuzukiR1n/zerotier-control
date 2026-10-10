# ZeroTier Control

[![Check and Docker](https://github.com/SuzukiR1n/zerotier-control/actions/workflows/ci.yml/badge.svg)](https://github.com/SuzukiR1n/zerotier-control/actions/workflows/ci.yml)

**自建 Planet + ZeroTier 1.16.2 控制器 + 全新中文 Web 管理界面。** 在空服务器上独立部署，首次启动生成自己的身份和 Planet 文件，随后在网页创建网络、授权成员。

**v0.4.0 · 用户名登录与首次强制修改 · 可配置下载加速 · 交互式部署脚本 · Docker Compose · 手机适配 · 明暗主题 · 无第三方 npm 运行依赖**

ZeroTier 当前锁定官方稳定版 [1.16.2](https://github.com/zerotier/ZeroTierOne/releases/tag/1.16.2)，源码提交与下载 SHA-256 均固定在 `Dockerfile.zerotier` 中。新版本将本地控制器移到了 `nonfree/`，构建显式启用 `ZT_NONFREE=1`。使用文件数据库，不需要 PostgreSQL、Redis 或 Central 账号。

**许可：** 本项目新增代码使用 MIT；上游 ZeroTier Agent/SDK 使用 MPL-2.0，新版控制器使用非商业用途的 Source-Available 许可。商业场景须取得上游授权，不能将整个整合镜像视为 MIT。[详细说明](NOTICE.md) · [上游许可](https://github.com/zerotier/ZeroTierOne/blob/1.16.2/nonfree/LICENSE.md)。

## 功能

- 首次运行生成私有 Planet；节点身份、签名密钥、网络和成员保存在数据卷中。
- 登录后查看根节点、公网地址、文件校验值，下载客户端 `planet` 文件。
- 中文网络总览、搜索、创建私有网络、重命名、删除确认。
- 自动配置 IPv4 子网、直连路由、地址池；手动维护 IPv4 / IPv6 路由和地址池。
- 成员授权、撤销授权、名称、固定 IP、桥接权限、关闭成员自动分配。
- IPv4 / IPv6 分配模式、RFC 4193、6plane、DNS、MTU、广播和多播设置。
- 控制器邻居节点与路径、网络配置导出、操作日志。
- 用户名和密码登录，初始账号 `admin / admin`；首次强制修改两项后才能管理网络或下载 Planet。
- 账号设置、scrypt 密码哈希、HttpOnly 会话、CSRF 检查、登录频率限制；修改账号后其他会话失效。私钥和控制器密钥不提供下载。

## 部署到新服务器

推荐 Debian 12/13、x86_64 公网服务器，首次编译建议至少 2 GB 内存。需要 Git；脚本可在尚未安装 Docker 的 Debian / Ubuntu 上，经确认后从 Docker 官方软件源安装 Engine 和 Compose 插件。已有 Docker 的服务器直接复用，其他系统请先自行安装 Docker Compose v2。当前自动检查使用 Linux/AMD64；ARM64 构建尚未验证。

以下命令在服务器以 root 执行：

```sh
git clone https://github.com/SuzukiR1n/zerotier-control.git
cd zerotier-control
bash deploy.sh
```

选择 **1. 安装 / 启动**，按提示确认公网 IP、ZeroTier UDP 端口（默认 `9993`）和 Web 端口（默认 `3443`）。脚本完成以下工作：

交互式首次安装会先询问下载线路；网络较慢时选择公开加速源或自定义地址，再进行服务器配置。已有部署可先运行 `bash deploy.sh downloads` 更换线路，不需要删除数据或重新填写公网 IP。

- 保存 `.env`，准备初始账号 `admin / admin`；密码文件只保存 scrypt 哈希，配置和密码文件权限为 600。
- 构建新版 ZeroTier 和 Web 镜像，启动整套服务并等待健康检查。
- 首次生成节点身份、签名密钥和私有 Planet。
- 将客户端文件导出到 `data/zerotier/dist/planet`。
- 显示访问地址、初始账号说明和需要放行的端口。

默认选择“公网 IP 直连”，打开脚本显示的 `http://你的公网IP:3443`，使用用户名 **admin**、密码 **admin** 登录。首次登录会进入账号设置，必须同时修改用户名和密码；完成前后端拒绝网络管理、状态读取和 Planet 下载请求，刷新页面也不能跳过。

新用户名需要 3–32 个字母、数字、下划线、点或连字符，并以字母或数字开头；新密码需要 12–256 个字符，不能沿用原密码，并需输入两次确认。保存后可进入管理面板，以后使用新账号登录。也可在“账号设置”中输入当前密码再次修改；其他已登录会话会失效。

从旧版本升级时，脚本自动将原明文密码文件转换为 scrypt 哈希，原密码仍可登录：首次使用用户名 `admin` 和原管理密码登录，再修改两项。忘记原密码可用 `bash deploy.sh reset-password` 重置。已经完成账号设置的部署，在重启、更新和重复安装后继续使用新账号。

云安全组须放行 **UDP 9993** 和 **TCP 3443**（按实际端口调整）。HTTP 传输未加密，正式使用可选择 HTTPS 反向代理模式。也可在安装时选择 SSH 隧道，网页仅监听服务器本机，然后从电脑运行脚本提示的 SSH 命令。

重复运行“安装 / 启动”会沿用已有 `.env`、密码、节点身份、Planet 和网络数据。已有配置时，脚本拒绝用新安装参数覆盖 IP 和端口。

首次构建会下载、校验并编译固定版本的 ZeroTier 源码，可能需要数分钟。与原项目的部署体验一样，一个脚本管理全部服务；本项目使用 Docker Compose 启动三个容器：

| 服务 | 用途 |
| --- | --- |
| `controller` | ZeroTier 1.16.2、Planet 根节点、网络控制器 |
| `control` | 新 Web 后端，访问控制器的本地 API |
| `gateway` | 网页入口 |

运行 `bash deploy.sh` 随时回到管理菜单：

| 操作 | 命令 |
| --- | --- |
| 安装 / 启动 | `bash deploy.sh install` |
| 备份并更新 | `bash deploy.sh update` |
| 状态、访问地址 | `bash deploy.sh status` |
| 导出客户端 Planet | `bash deploy.sh planet` |
| 完整备份 | `bash deploy.sh backup` |
| 重置账号为 admin / admin，强制再次修改 | `bash deploy.sh reset-password` |
| 查看日志 | `bash deploy.sh logs` |
| 移除容器，保留数据 | `bash deploy.sh uninstall` |
| 配置 Docker / GitHub 下载加速 | `bash deploy.sh downloads` |

无人值守首次安装示例（将文档示例 IP 换成自己的公网 IP）：

```sh
bash deploy.sh install --ip 203.0.113.10 --zt-port 9993 --web-port 3443 --access public
```

可添加 `--ipv6 2001:db8::10`；仅本机访问使用 `--access local`，已有 HTTPS 代理使用 `--access proxy --origin https://control.example.com`。脚本不签发 HTTPS 证书，不自动修改云安全组。没有 Docker 时，无人值守安装会停止并提示先安装 Docker；交互式安装会提供安装选项。

### 手动 Compose 部署

也可自行配置，不运行交互式脚本。此方式默认仅本机监听 8080：

```sh
cp .env.example .env
chmod 600 .env
```

编辑 `.env`，把 `YOUR_PUBLIC_IP` 换成自己的地址：

```dotenv
PLANET_ENDPOINTS=YOUR_PUBLIC_IP/9993
ZT_PORT=9993
WEB_PORT=8080
WEB_BIND_ADDRESS=127.0.0.1
ADMIN_PASSWORD_PATH=./secrets/admin-password
PUBLIC_ORIGIN=http://localhost:8080
COOKIE_SECURE=false
```

支持逗号分隔的 IPv4 / IPv6，例如 `203.0.113.10/9993,2001:db8::10/9993`。使用 IP/端口格式，不使用域名；多个地址应当指向同一个部署。此版本不自动配置跨服务器容灾。

构建网页镜像并准备初始账号：

```sh
docker build -t zerotier-control:local .
docker run --rm --user 0:0 --mount "type=bind,src=$PWD,dst=/work" \
  --workdir /work --entrypoint node zerotier-control:local scripts/password.js
```

生成器不会覆盖已有密码。随后启动整套服务：

```sh
docker compose --env-file .env up -d --build --wait --wait-timeout 120
```

修改 `ZT_PORT` 时同步修改 `PLANET_ENDPOINTS` 中的端口。手动方式默认只监听 `127.0.0.1:8080`，从自己的电脑建立 SSH 隧道：

```sh
ssh -L 8080:127.0.0.1:8080 root@YOUR_SERVER
```

打开 <http://localhost:8080>，使用 `admin / admin` 登录并完成首次账号设置。访问地址应与 `PUBLIC_ORIGIN` 一致。

容器不使用 `privileged` 或挂载 Docker socket。控制器只承担根节点和配置服务，不加入网络，无须 TUN 设备；管理后端共享控制器的网络空间，通过 Unix socket 连接网页入口。

## 客户端接入

1. 在网页“Planet 与客户端”下载 `planet`。
2. 在客户端停止 ZeroTier 服务，备份原 `planet`，替换为下载文件，然后重启服务。
3. 在网页创建网络，如 `10.42.0.0/24`，记下网络 ID。
4. 客户端加入此网络，在网页成员列表授权该设备。
5. 确认客户端获取地址，`zerotier-cli peers` 中根节点角色为 `PLANET`、地址为自己的服务器。

| 客户端 | Planet 路径 |
| --- | --- |
| Windows | `C:\ProgramData\ZeroTier\One\planet` |
| Linux | `/var/lib/zerotier-one/planet` |
| macOS | `/Library/Application Support/ZeroTier/One/planet` |

以 Linux 为例，在保存好原文件后：

```sh
sudo systemctl stop zerotier-one
sudo cp ./planet /var/lib/zerotier-one/planet
sudo systemctl start zerotier-one
sudo zerotier-cli join YOUR_NETWORK_ID
sudo zerotier-cli peers
```

Windows 使用管理员权限停止并重启 ZeroTier One 服务。官方 Android/iOS 应用不提供导入自建 Planet 的界面，须使用支持该功能的客户端；该仓库不包含移动端客户端。

## 域名和 HTTPS

安装时可直接选择“已有 HTTPS 反向代理”，填写域名。在服务器的 HTTPS 反向代理中，将域名转发到 `127.0.0.1:3443`（或自己的 Web 端口），保留原始 `Host`。

已经部署后，也可修改 `.env`：

```dotenv
PUBLIC_ORIGIN=https://control.example.com
COOKIE_SECURE=true
WEB_BIND_ADDRESS=127.0.0.1
```

然后运行 `bash deploy.sh install`。网页部署在域名根路径，不支持 `/control/` 子路径。SSH 本机 HTTP 隧道使用 `COOKIE_SECURE=false`；HTTPS 使用 `true`。

## 文件持久化和备份

数据卷用途：

| 卷 | 保存内容 |
| --- | --- |
| `zerotier-data` | 节点身份、Planet 签名密钥、Planet、`controller.d` 网络和成员配置 |
| `planet-files` | 客户端 Planet 及公开元数据 |
| `controller-access` | 控制器本地 API 密钥，只提供给管理后端 |
| `control-data` | 网页操作日志 |
| `control-socket` | 服务间通信 socket |

重启或重建容器会复用身份、签名密钥和 Planet。不要删除数据卷。`docker compose down` 保留卷；`down -v` 会删除部署数据。

运行脚本完成一致性备份；它短暂停服务，复制数据后恢复备份前运行的服务，失败时也会尝试恢复：

```sh
bash deploy.sh backup
```

备份保存到 `backups/时间戳/`，包含 `zerotier-one/`（身份、签名密钥、Planet 和网络）、`web-data/`（管理员账号哈希、首次设置状态和操作日志）、`.env`、`admin-password` 和源码版本记录。目录权限 700，包含私钥和密码，须加密保管。恢复时将 `web-data/` 内容恢复到 Web 数据卷，并将初始密码文件放回 `.env` 的 `ADMIN_PASSWORD_PATH`；当前未提供自动恢复命令。网页导出的网络 JSON **不能替代完整备份**。

升级项目：

```sh
bash deploy.sh update
```

更新会先完整备份，再快进拉取源码、重建并启动服务；原身份、Planet、密码和网络继续复用。有未提交的源码修改时停止更新。下载 ZIP、没有 Git 仓库或只想重建当前源码时，使用 `bash deploy.sh update --skip-pull`。

默认不会自动跟随上游 `latest`；新版 ZeroTier 需由项目更新锁定源码和校验值，再通过集成测试。更改公网地址后启动会提示配置变化；需先备份、停掉整套服务，再显式重新生成 Planet：

```sh
docker compose stop
docker compose run --rm --no-deps controller --regenerate
docker compose up -d --force-recreate --wait
```

重新生成会保留节点身份和签名密钥；为确保所有客户端接入新地址，应重新下载、分发客户端文件。缺少一份签名密钥时不会自动创建新密钥，需恢复完整备份。

## 管理账号与重置

管理员用户名、scrypt 密码哈希和首次设置状态保存在 Web 数据卷 `/app/data/admin-account.json`（文件权限 600）。使用随机盐和 scrypt 保存密码，不存明文；后台不会返回密码或哈希，操作日志不记录密码。`secrets/admin-password` 也只保存 scrypt 哈希，用于没有账号文件时的初始化，不代表修改后的登录密码。升级、重复安装和新备份会自动转换旧的明文初始密码文件。直接运行 Node 时也默认初始化 `admin / admin`；可用 `ADMIN_PASSWORD_FILE` 或 `ADMIN_PASSWORD_HASH` 提供初始化哈希，已有账号文件时继续使用持久化账号。

忘记用户名或密码时，在服务器项目目录以 root 执行：

```sh
bash deploy.sh reset-password
```

脚本先完整备份，再停止 Web、将管理账号重置为 `admin / admin` 并重启。下次登录必须重新修改两项。Planet、ZeroTier 身份和网络数据继续沿用。手动 Compose 部署可先备份并停止 `control`，再运行 `docker compose run --rm --no-deps --entrypoint node control scripts/reset-account.js`，随后重新启动 `control` 和 `gateway`。

## Docker 和 GitHub 下载加速

在项目目录运行：

```sh
bash deploy.sh downloads
bash deploy.sh install
```

线路菜单包含公开加速源、自定义和官方直连。公开线路选项目前使用 [1Panel 镜像站](https://docker.1panel.dev/) 和 [GH-Proxy](https://gh-proxy.com/docs/github-accelerator)，属于第三方公共服务，实际可用性和速度取决于服务器线路，可随时更换。

也可一次指定并保存：

```sh
bash deploy.sh downloads --docker-registry docker.1panel.dev --github-proxy https://gh-proxy.org/
bash deploy.sh install
```

配置保存在权限 600 的 `.download.env`，不提交到 Git：

```dotenv
DOCKER_REGISTRY=docker.1panel.dev
GITHUB_PROXY=https://gh-proxy.org/
```

Docker 配置作用于 **Node、Debian、Python 和 Nginx**。它直接指定本项目镜像仓库，覆盖镜像拉取和 Dockerfile 的 `FROM`，不修改 `/etc/docker/daemon.json`，不需要重启 Docker，也不依赖独立 BuildKit 是否读取 Docker 的守护进程配置。自建源须支持 `/v2/` Registry API 和 `library/镜像名`，例如 `registry.example.com/library/node:24-bookworm-slim`。[Docker 镜像站说明](https://docs.docker.com/docker-hub/image-library/mirror/)

GitHub 配置作用于 ZeroTier 源码归档下载和脚本中的仓库更新。代理须支持 `前缀/https://github.com/...`；用于 `git pull` 时还需支持 Git Smart HTTP。仅对这次公开仓库拉取设置地址替换，不写全局 Git 配置。源码提交和 SHA-256 保持固定，代理返回错误页面或不同内容时停止编译。

仓库尚未下载、或获取新版脚本也很慢时：

```sh
# 首次获取：
git clone https://gh-proxy.org/https://github.com/SuzukiR1n/zerotier-control.git

# 已有仓库：在仓库内临时通过代理拉取新版，不修改 origin：
git -c 'url.https://gh-proxy.org/https://github.com/.insteadOf=https://github.com/' pull --ff-only
```

若首次通过代理克隆，建议随后将 `origin` 设为官方地址，以便下载线路切换时沿用新的配置：

```sh
git remote set-url origin https://github.com/SuzukiR1n/zerotier-control.git
```

恢复直连：`bash deploy.sh downloads --docker-registry docker.io --github-proxy direct`。手动 Compose 构建也可读取该文件：`docker compose --env-file .env --env-file .download.env up -d --build --wait`；直接运行 `docker build` 时传入 `--build-arg DOCKER_REGISTRY=镜像域名`，控制器构建还可传入 `--build-arg GITHUB_PROXY=https://代理前缀/`。

### 下载中断后的继续安装

如果下载 `nginx:stable-alpine` 时出现 `unexpected EOF`、`short read` 或超时，说明 Docker 没有取得完整下载结果；具体原因可能在网络、代理或镜像源。脚本会在启动容器前拉取网页入口镜像，失败时最多尝试 3 次，间隔 5 秒和 10 秒；全部失败后保留配置和数据并退出。

配置下载加速后，在项目目录继续安装：

```sh
bash deploy.sh install
```

旧版脚本也可先执行 `docker compose pull gateway`，成功后再运行 `bash deploy.sh install`。已下载的完整镜像层会复用；不用重新填写公网 IP。若持续失败，检查服务器 Docker 守护进程使用的代理或镜像源；仅设置当前终端的代理不一定影响 Docker 拉取。[Docker 镜像拉取与代理说明](https://docs.docker.com/reference/cli/docker/image/pull/)

## 仅体验 Web 界面

本机安装 Node.js 24 后运行 `npm run demo`，访问 <http://127.0.0.1:8080>。或使用：

```sh
docker compose -f deploy/compose.demo.yaml up -d --build
```

演示无需密码，使用模拟数据，不生成 Planet，不连接实际控制器，重启后重置。不能作为生产配置。

## 开发和验证

```sh
npm run check
npm test
python3 -m unittest discover -s test -p '*_test.py'
```

受限 Windows 环境不能创建测试子进程时，可用 `node --test --test-isolation=none test/app.test.js test/planet.test.js test/deploy-config.test.js`。

GitHub Actions 检查部署脚本语法和 ShellCheck，测试用户名登录、首次强制修改、防止跳过设置、账号持久化、并发首次设置、会话失效、CSRF、频率限制、校验和网络成员操作。真实容器流程将四种基础镜像放入隔离 Registry，再通过该 Registry 完成构建、首次安装、重复安装、备份更新、密码重置、移除容器后重新安装，验证 Planet 和身份不变、备份密钥和账号完整、重置后旧账号失效、默认账号再次要求修改，以及实际 ZeroTier 1.16.2 客户端接入私有 Planet、网页授权并获取地址。另行验证 GitHub 代理下载重试、校验不符时停止、仅对本次 Git 拉取改写地址，并模拟镜像拉取两次失败后恢复、持续失败后退出且不重建已有容器。客户端测试单独使用 TUN 权限，生产控制器不需要这些权限。

CI 使用隔离的测试地址和随机运行时身份，不证明实际公网线路、NAT 穿透或跨地区稳定性。部署后仍应在自己的设备上确认连接。

## 版本范围

v0.4.0 提供下载线路配置、部署脚本、单个根节点和控制器、单个管理员。暂未提供多个控制器切换、多用户权限、Flow Rules DSL 编辑、Moon 管理或自动备份恢复。修改普通网络设置只发送对应字段，保留已有高级配置。

成员列表显示授权状态，不是实时在线表；节点连接页显示控制器自身的 `/peer` 路径。删除正在申请加入的成员后，该设备仍可能再次出现在待授权列表。

## 来源与许可

- [ZeroTier 官方源码与 1.16.2](https://github.com/zerotier/ZeroTierOne/tree/1.16.2)
- [ZeroTier 控制器文档](https://docs.zerotier.com/controller/)
- [ZeroTier World 格式](https://github.com/zerotier/ZeroTierOne/blob/1.16.2/node/World.hpp)
- [第三方组件与许可说明](NOTICE.md)

项目目标参考了 [docker-zerotier-planet](https://github.com/xubiaolin/docker-zerotier-planet)，Web 和部署工具为新实现。与 ZeroTier, Inc. 无隶属关系，ZeroTier 商标归其所有者。
