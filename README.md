# ZeroTier Control

[![Check and Docker](https://github.com/SuzukiR1n/zerotier-control/actions/workflows/ci.yml/badge.svg)](https://github.com/SuzukiR1n/zerotier-control/actions/workflows/ci.yml)

**自建 Planet + ZeroTier 1.16.2 控制器 + 全新中文 Web 管理界面。** 在空服务器上独立部署，首次启动生成自己的身份和 Planet 文件，随后在网页创建网络、授权成员。

**v0.2.0 · Docker Compose · 手机适配 · 明暗主题 · 无第三方 npm 运行依赖**

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
- 密码登录、HttpOnly 会话、CSRF 检查、登录频率限制；私钥和控制器密钥不提供下载。

## 部署到新服务器

需要 Linux 公网服务器、Docker、Docker Compose v2 和 Git。推荐 Debian 12/13、x86_64，首次源码编译建议至少 2 GB 内存。当前自动检查使用 Linux/AMD64；ARM64 构建尚未验证。

以下命令在服务器以 root 执行：

```sh
git clone https://github.com/SuzukiR1n/zerotier-control.git
cd zerotier-control
cp .env.example .env
chmod 600 .env
```

编辑 `.env`，把 `YOUR_PUBLIC_IP` 改成新服务器公网 IP：

```dotenv
PLANET_ENDPOINTS=YOUR_PUBLIC_IP/9993
ZT_PORT=9993
WEB_PORT=8080
ADMIN_PASSWORD_PATH=./secrets/admin-password
PUBLIC_ORIGIN=http://localhost:8080
COOKIE_SECURE=false
```

支持逗号分隔的 IPv4 / IPv6，例如 `203.0.113.10/9993,2001:db8::10/9993`；这些是文档示例地址，部署时必须换成自己的地址。文件使用 IP/端口格式，不使用域名。多个地址应当指向同一个部署；此版本不自动配置跨服务器容灾。

构建网页镜像并生成随机管理密码：

```sh
docker build -t zerotier-control:local .
docker run --rm --user 0:0 --mount "type=bind,src=$PWD,dst=/work" \
  --workdir /work --entrypoint node zerotier-control:local scripts/password.js
```

密码保存在 `secrets/admin-password`，请自行查看并妥善保管。文件为 root 所有、权限 600；生成器不会覆盖已有密码。无需在配置或命令参数中填写明文密码。

启动整套服务：

```sh
docker compose --env-file .env up -d --build --wait --wait-timeout 120
docker compose ps
```

第一次构建会下载、校验并编译 ZeroTier 官方源码，耗时取决于服务器及网络。默认使用 2 个编译任务。构建完成后启动三个容器：

| 服务 | 用途 |
| --- | --- |
| `controller` | ZeroTier 1.16.2、Planet 根节点、网络控制器 |
| `control` | 新 Web 后端，访问控制器的本地 API |
| `gateway` | 网页入口 |

服务器和云安全组须允许 **UDP 9993** 入站，以及对应的 UDP 出站。修改 `ZT_PORT` 时同步修改 `PLANET_ENDPOINTS` 的端口。控制器管理 API 不映射到公网；网页默认只监听服务器 `127.0.0.1:8080`。

从自己的电脑建立 SSH 隧道：

```sh
ssh -L 8080:127.0.0.1:8080 root@YOUR_SERVER
```

在电脑打开 <http://localhost:8080>，使用生成的密码登录。访问地址应与 `PUBLIC_ORIGIN` 一致。

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

在服务器 HTTPS 反向代理中将域名转发到 `127.0.0.1:8080`，保留原始 `Host`。修改 `.env`：

```dotenv
PUBLIC_ORIGIN=https://control.example.com
COOKIE_SECURE=true
```

然后 `docker compose up -d --force-recreate`。网页部署在域名根路径，不支持 `/control/` 子路径。SSH 本机 HTTP 隧道使用 `COOKIE_SECURE=false`；HTTPS 使用 `true`。

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

完整备份示例，先停服务以获得一致的数据：

```sh
install -d -m 700 backups
docker compose stop
docker compose cp controller:/var/lib/zerotier-one backups/zerotier-one
docker compose cp control:/app/data backups/web-data
docker compose start
```

另行保存管理密码、`.env` 和部署源码。备份包含私钥，须加密保管。网页导出的网络 JSON 用于查看和保存配置，**不能替代完整备份**，目前没有配置导入功能。

升级项目：

```sh
git pull
docker compose --env-file .env up -d --build --force-recreate --wait
```

默认不会自动跟随上游 `latest`；新版 ZeroTier 需由项目更新锁定源码和校验值，再通过集成测试。更改公网地址后启动会提示配置变化；需先备份、停掉整套服务，再显式重新生成 Planet：

```sh
docker compose stop
docker compose run --rm --no-deps controller --regenerate
docker compose up -d --force-recreate --wait
```

重新生成会保留节点身份和签名密钥；为确保所有客户端接入新地址，应重新下载、分发客户端文件。缺少一份签名密钥时不会自动创建新密钥，需恢复完整备份。

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

受限 Windows 环境不能创建测试子进程时，可用 `node --test --test-isolation=none test/app.test.js test/planet.test.js`。

GitHub Actions 测试登录、会话、CSRF、频率限制、校验和网络成员操作，并构建整个部署。真实容器检查包含 ZeroTier 1.16.2 网络/成员/DNS API、Planet 下载与校验、实际客户端加入私有 Planet、网页授权、客户端状态/分配地址，以及重建容器后身份和 Planet 不变。客户端测试单独使用 TUN 权限，生产控制器不需要这些权限。

CI 使用隔离的测试地址和随机运行时身份，不证明实际公网线路、NAT 穿透或跨地区稳定性。部署后仍应在自己的设备上确认连接。

## 版本范围

v0.2.0 提供单个根节点和控制器、单个管理员。暂未提供多个控制器切换、多用户权限、Flow Rules DSL 编辑、Moon 管理或完整备份恢复。修改普通网络设置只发送对应字段，保留已有高级配置。

成员列表显示授权状态，不是实时在线表；节点连接页显示控制器自身的 `/peer` 路径。删除正在申请加入的成员后，该设备仍可能再次出现在待授权列表。

## 来源与许可

- [ZeroTier 官方源码与 1.16.2](https://github.com/zerotier/ZeroTierOne/tree/1.16.2)
- [ZeroTier 控制器文档](https://docs.zerotier.com/controller/)
- [ZeroTier World 格式](https://github.com/zerotier/ZeroTierOne/blob/1.16.2/node/World.hpp)
- [第三方组件与许可说明](NOTICE.md)

项目目标参考了 [docker-zerotier-planet](https://github.com/xubiaolin/docker-zerotier-planet)，Web 和部署工具为新实现。与 ZeroTier, Inc. 无隶属关系，ZeroTier 商标归其所有者。
