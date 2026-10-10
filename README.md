# ZeroTier Control

一个自托管的 ZeroTier 控制器管理面板，面向习惯使用中文界面的个人和小型团队。通过本地 Controller API 管理网络与成员，替代 ztncui 的管理界面。

**v0.1.0 · 中文界面 · Docker · 手机适配 · 明暗主题**

独立的管理项目。使用现有 ZeroTier 控制器存储网络数据，管理面板自身不生成 Planet、不启动第二个 ZeroTier 节点，也不修改节点身份文件。按 ZeroTier **1.14.1** 的稳定控制器 API 实现；其他版本请先验证兼容性。

## 功能

- 网络总览、搜索、创建私有网络、重命名、删除确认。
- 自动生成 IPv4 子网的直连路由和地址池；支持手动维护 IPv4 / IPv6 路由及地址池。
- 成员登记、授权、撤销授权、名称、固定 IP、桥接权限、关闭成员自动分配。
- IPv4 / IPv6 分配模式、RFC 4193、6plane、DNS、MTU、广播及多播设置。
- 查看控制器的邻居节点、Planet 路径和延迟。
- 网络及成员配置导出、操作日志。
- 密码登录、HttpOnly 会话、CSRF 校验、登录频率限制；控制器密钥仅在后端使用。
- 无第三方 npm 运行依赖，原生 HTML / CSS / JavaScript + Node.js 24。

## 先体验界面

本机安装 Node.js 24 后：

```sh
git clone https://github.com/SuzukiR1n/zerotier-control.git
cd zerotier-control
npm run demo
```

打开 <http://127.0.0.1:8080>。演示使用内存中的模拟数据，无须密码，也不会连接实际控制器。创建、授权和修改可实际交互；服务重启后重置。演示中的成员数量及路径不是你的服务器数据。

只用 Docker 体验：

```sh
docker compose -f deploy/compose.demo.yaml up -d --build
```

访问同一地址。演示入口仅绑定本机；不要把免登录的演示模式当作生产配置。

## 生产部署：接入 docker-zerotier-planet

适用于已有 `myztplanet` 容器的 Linux 服务器，需要 Docker 和 Docker Compose v2。面板与原控制器共享网络空间，访问其 `127.0.0.1:9994`；网页由独立入口容器提供，不要求原容器已经映射新的网页端口。

1. 下载项目，构建管理镜像，生成随机管理密码：

```sh
git clone https://github.com/SuzukiR1n/zerotier-control.git
cd zerotier-control
docker build -t zerotier-control:local .
docker run --rm --user 0:0 --mount "type=bind,src=$PWD,dst=/work" \
  --workdir /work --entrypoint node zerotier-control:local scripts/password.js
cp .env.example .env
chmod 600 .env
```

`secrets/admin-password` 是管理密码文件，请自行查看并妥善保管。生成器拒绝覆盖已有文件。不要将密码、控制器密钥或任何真实服务器数据提交到 Git。

2. 查找原容器的宿主机数据路径：

```sh
docker inspect myztplanet --format '{{range .Mounts}}{{if eq .Destination "/var/lib/zerotier-one"}}{{println .Source}}{{end}}{{end}}'
```

在 `.env` 填入以下配置，将示例路径改成自己的**绝对路径**：

```dotenv
ZT_CONTAINER_NAME=myztplanet
ZT_PORT=9994
ZT_TOKEN_PATH=/absolute/path/data/zerotier/one/authtoken.secret
ADMIN_PASSWORD_PATH=/absolute/path/zerotier-control/secrets/admin-password
PUBLIC_ORIGIN=http://localhost:8080
COOKIE_SECURE=false
```

`ZT_PORT` 是容器内 ZeroTier 控制器的端口，不是原 ztncui 网页端口。`ADMIN_PASSWORD_PATH` 在此方式下必须使用绝对路径。原容器需要正在运行。

3. 从仓库根目录启动：

```sh
docker compose --env-file .env -f deploy/compose.planet.yaml up -d --build
docker compose --env-file .env -f deploy/compose.planet.yaml ps
```

入口默认仅监听服务器 `127.0.0.1:8080`。从自己的电脑建立 SSH 隧道：

```sh
ssh -L 8080:127.0.0.1:8080 root@YOUR_SERVER
```

随后在自己电脑打开 <http://localhost:8080>，输入生成的管理密码。这里 `localhost` 与 `.env` 的 `PUBLIC_ORIGIN` 保持一致。

原来的 ztncui 可同时存在。成员的名称、授权、分配地址来自控制器，会自动显示；原 ztncui 的网页登录密码、账户和界面偏好不导入，新面板使用自己的管理密码。如果原项目重新创建了 `myztplanet` 容器，请重建面板的共享网络空间：

```sh
docker compose --env-file .env -f deploy/compose.planet.yaml up -d --force-recreate
```

## 生产部署：Linux 原生 ZeroTier 服务

如果 ZeroTier 直接安装在 Linux 主机上，采用根目录的 `compose.yaml`。同样先构建镜像、生成密码、复制 `.env.example`。

```dotenv
ZT_API_URL=http://127.0.0.1:9993
ZT_TOKEN_PATH=/var/lib/zerotier-one/authtoken.secret
ADMIN_PASSWORD_PATH=./secrets/admin-password
PUBLIC_ORIGIN=http://localhost:8080
COOKIE_SECURE=false
```

```sh
docker compose --env-file .env up -d --build
```

此方式使用 Linux 主机网络，网页绑定 `127.0.0.1:8080`，同样通过 SSH 隧道或 HTTPS 反向代理访问。Compose 默认以容器 root 读取宿主机 root 拥有的密钥文件，并移除全部 capabilities，密钥只读挂载，容器文件系统只读。没有 Docker socket 挂载。

## 使用域名与 HTTPS

在服务器的 HTTPS 反向代理中，将域名转发到 `127.0.0.1:8080`，保留原始 `Host`。设置：

```dotenv
PUBLIC_ORIGIN=https://control.example.com
COOKIE_SECURE=true
```

修改后重新创建管理容器。管理服务会校验浏览器来源并设置 Secure cookie。单纯用 HTTP IP 地址访问而仍设置 `COOKIE_SECURE=true` 会导致无法保留登录；没有 HTTPS 的 SSH 本机隧道应使用 `false`。

面板以 `/` 为根路径部署，不支持挂在 `/control/` 等子路径。不要把 ZeroTier 原始控制器 API 公开到互联网；后端的 `ZT_API_URL` 应指向可信的本机地址，跨主机使用时须自行提供受控网络或 HTTPS。

## 本地连接实际控制器

设置环境变量或在 `.env` 写入：

```dotenv
HOST=127.0.0.1
PORT=8080
ADMIN_PASSWORD_FILE=./secrets/admin-password
ZT_API_URL=http://127.0.0.1:9993
ZT_TOKEN_FILE=/var/lib/zerotier-one/authtoken.secret
DATA_DIR=./data
PUBLIC_ORIGIN=http://localhost:8080
```

```sh
npm run password
npm start
```

`ZT_TOKEN_FILE` 在 Node 直接运行时使用，`ZT_TOKEN_PATH` 是 Compose 用来挂载该文件的宿主机路径。后端每次请求读取密钥文件，以兼容密钥轮换；文件挂载被外部原子替换时可能需要重建容器。

如需使用密码哈希，可通过 `node scripts/password.js --hash` 的标准输入生成 scrypt 哈希，设置 `ADMIN_PASSWORD_HASH`（格式 `scrypt:salt:digest`）。有哈希时优先于密码文件；不要把明文密码放进命令参数。单个管理员，会话有效期 8 小时，服务重启后会话失效。

## 日志与备份

- 面板数据目录只保存操作日志，生产 Compose 使用 `control-data` 卷。当前启动以来最多 200 条成功操作可在页面查看。
- 完整日志保存为 `audit.jsonl`，超过 5 MiB 轮转到 `.previous`；审计写入失败会显示在控制器信息页和服务日志中。
- 网络和成员保存于 ZeroTier 的 `controller.d`。完整备份还需要 `identity.secret` 和控制器的其他必要运行数据。
- 网页导出的 JSON 用于查看和保存网络设置，**不能替代完整备份**，v0.1.0 没有配置导入功能。

## 版本边界

v0.1.0 支持单个控制器、单个管理员。尚未提供多用户权限、多个控制器切换、Flow Rules DSL 编辑、Planet 生成与签名、流量监控或完整备份恢复。保存普通设置时只发送对应字段，不覆盖已有流规则或其他高级配置。

控制器的成员列表并非实时在线表，所以页面显示授权状态。节点连接页展示的是控制器自身的 `/peer` 路径，不是全部客户端之间的链路。删除在线成员后，它仍可能重新申请加入并出现在待授权列表。

## 开发和验证

```sh
npm run check
npm test
```

测试覆盖实际 HTTP 登录/会话/CSRF/频率限制、网络成员操作、数据校验、静态资源保护，以及复现 1.14.1 API 数据格式的模拟控制器。受限的 Windows 执行环境不能创建测试子进程时，使用 `node --test --test-isolation=none test/app.test.js`。

GitHub Actions 运行测试、构建 Docker 镜像，并启动容器进行检查。开发预览只能证明模拟数据流程；生产安装后应核对控制器 ID、现有网络及成员，再做一次实际设备授权与连接验证。

## 接口来源

- [ZeroTier 官方控制器文档](https://docs.zerotier.com/controller/)
- [ZeroTier 1.14.1 EmbeddedNetworkController.cpp](https://github.com/zerotier/ZeroTierOne/blob/1.14.1/controller/EmbeddedNetworkController.cpp)
- [Docker Compose 配置](https://docs.docker.com/reference/compose-file/services/)
- [Nginx Unix socket 反向代理](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)

MIT 许可。与 ZeroTier, Inc. 无隶属关系；ZeroTier 名称及商标归其所有者。
