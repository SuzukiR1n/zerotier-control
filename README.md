# ZeroTier Control

[![Check and Docker](https://github.com/SuzukiR1n/zerotier-control/actions/workflows/ci.yml/badge.svg)](https://github.com/SuzukiR1n/zerotier-control/actions/workflows/ci.yml)

**�Խ� Planet + ZeroTier 1.16.2 ������ + ȫ������ Web �������档** �ڿշ������϶��������״����������Լ������ݺ� Planet �ļ����������ҳ�������硢��Ȩ��Ա��

**v0.4.0 �� �û�����¼���״�ǿ���޸� �� ���������ؼ��� �� ����ʽ����ű� �� Docker Compose �� �ֻ����� �� �������� �� �޵����� npm ��������**

ZeroTier ��ǰ�����ٷ��ȶ��� [1.16.2](https://github.com/zerotier/ZeroTierOne/releases/tag/1.16.2)��Դ���ύ������ SHA-256 ���̶��� `Dockerfile.zerotier` �С��°汾�����ؿ������Ƶ��� `nonfree/`��������ʽ���� `ZT_NONFREE=1`��ʹ���ļ����ݿ⣬����Ҫ PostgreSQL��Redis �� Central �˺š�

**���ɣ�** ����Ŀ��������ʹ�� MIT������ ZeroTier Agent/SDK ʹ�� MPL-2.0���°������ʹ�÷���ҵ��;�� Source-Available ���ɡ���ҵ������ȡ��������Ȩ�����ܽ��������Ͼ�����Ϊ MIT��[��ϸ˵��](NOTICE.md) �� [��������](https://github.com/zerotier/ZeroTierOne/blob/1.16.2/nonfree/LICENSE.md)��

## ����

- �״���������˽�� Planet���ڵ����ݡ�ǩ����Կ������ͳ�Ա���������ݾ��С�
- ��¼��鿴���ڵ㡢������ַ���ļ�У��ֵ�����ؿͻ��� `planet` �ļ���
- ������������������������˽�����硢��������ɾ��ȷ�ϡ�
- �Զ����� IPv4 ������ֱ��·�ɡ���ַ�أ��ֶ�ά�� IPv4 / IPv6 ·�ɺ͵�ַ�ء�
- ��Ա��Ȩ��������Ȩ�����ơ��̶� IP���Ž�Ȩ�ޡ��رճ�Ա�Զ����䡣
- IPv4 / IPv6 ����ģʽ��RFC 4193��6plane��DNS��MTU���㲥�Ͷಥ���á�
- �������ھӽڵ���·�����������õ�����������־��
- �û����������¼����ʼ�˺� `admin / admin`���״�ǿ���޸��������ܹ������������ Planet��
- �˺����á�scrypt �����ϣ��HttpOnly �Ự��CSRF ��顢��¼Ƶ�����ƣ��޸��˺ź������ỰʧЧ��˽Կ�Ϳ�������Կ���ṩ���ء�

## �����·�����

�Ƽ� Debian 12/13��x86_64 �������������״α��뽨������ 2 GB �ڴ档��Ҫ Git���ű�������δ��װ Docker �� Debian / Ubuntu �ϣ���ȷ�Ϻ�� Docker �ٷ�����Դ��װ Engine �� Compose ��������� Docker �ķ�����ֱ�Ӹ��ã�����ϵͳ�������а�װ Docker Compose v2����ǰ�Զ����ʹ�� Linux/AMD64��ARM64 ������δ��֤��

���������ڷ������� root ִ�У�

```sh
git clone https://github.com/SuzukiR1n/zerotier-control.git
cd zerotier-control
bash deploy.sh
```

ѡ�� **1. ��װ / ����**������ʾȷ�Ϲ��� IP��ZeroTier UDP �˿ڣ�Ĭ�� `9993`���� Web �˿ڣ�Ĭ�� `3443`�����ű�������¹�����

����ʽ�״ΰ�װ����ѯ��������·���������ʱѡ�񹫿�����Դ���Զ����ַ���ٽ��з��������á����в���������� `bash deploy.sh downloads` ������·������Ҫɾ�����ݻ�������д���� IP��

- ���� `.env`��׼����ʼ�˺� `admin / admin`�������ļ�ֻ���� scrypt ��ϣ�����ú������ļ�Ȩ��Ϊ 600��
- �����°� ZeroTier �� Web �����������׷��񲢵ȴ�������顣
- �״����ɽڵ����ݡ�ǩ����Կ��˽�� Planet��
- ���ͻ����ļ������� `data/zerotier/dist/planet`��
- ��ʾ���ʵ�ַ����ʼ�˺�˵������Ҫ���еĶ˿ڡ�

Ĭ��ѡ�񡰹��� IP ֱ�������򿪽ű���ʾ�� `http://��Ĺ���IP:3443`��ʹ���û��� **admin**������ **admin** ��¼���״ε�¼������˺����ã�����ͬʱ�޸��û��������룻���ǰ��˾ܾ����������״̬��ȡ�� Planet ��������ˢ��ҳ��Ҳ����������

���û�����Ҫ 3�C32 ����ĸ�����֡��»��ߡ�������ַ���������ĸ�����ֿ�ͷ����������Ҫ 12�C256 ���ַ�����������ԭ���룬������������ȷ�ϡ������ɽ��������壬�Ժ�ʹ�����˺ŵ�¼��Ҳ���ڡ��˺����á������뵱ǰ�����ٴ��޸ģ������ѵ�¼�Ự��ʧЧ��

�Ӿɰ汾����ʱ���ű��Զ���ԭ���������ļ�ת��Ϊ scrypt ��ϣ��ԭ�����Կɵ�¼���״�ʹ���û��� `admin` ��ԭ���������¼�����޸��������ԭ������� `bash deploy.sh reset-password` ���á��Ѿ�����˺����õĲ��������������º��ظ���װ�����ʹ�����˺š�

�ư�ȫ������� **UDP 9993** �� **TCP 3443**����ʵ�ʶ˿ڵ�������HTTP ����δ���ܣ���ʽʹ�ÿ�ѡ�� HTTPS �������ģʽ��Ҳ���ڰ�װʱѡ�� SSH ��������ҳ������������������Ȼ��ӵ������нű���ʾ�� SSH ���

�ظ����С���װ / ���������������� `.env`�����롢�ڵ����ݡ�Planet ���������ݡ���������ʱ���ű��ܾ����°�װ�������� IP �Ͷ˿ڡ�

�״ι��������ء�У�鲢����̶��汾�� ZeroTier Դ�룬������Ҫ�����ӡ���ԭ��Ŀ�Ĳ�������һ����һ���ű�����ȫ�����񣻱���Ŀʹ�� Docker Compose ��������������

| ���� | ��; |
| --- | --- |
| `controller` | ZeroTier 1.16.2��Planet ���ڵ㡢��������� |
| `control` | �� Web ��ˣ����ʿ������ı��� API |
| `gateway` | ��ҳ��� |

���� `bash deploy.sh` ��ʱ�ص������˵���

| ���� | ���� |
| --- | --- |
| ��װ / ���� | `bash deploy.sh install` |
| ���ݲ����� | `bash deploy.sh update` |
| ״̬�����ʵ�ַ | `bash deploy.sh status` |
| �����ͻ��� Planet | `bash deploy.sh planet` |
| �������� | `bash deploy.sh backup` |
| �����˺�Ϊ admin / admin��ǿ���ٴ��޸� | `bash deploy.sh reset-password` |
| �鿴��־ | `bash deploy.sh logs` |
| �Ƴ��������������� | `bash deploy.sh uninstall` |
| ���� Docker / GitHub ���ؼ��� | `bash deploy.sh downloads` |

����ֵ���״ΰ�װʾ�������ĵ�ʾ�� IP �����Լ��Ĺ��� IP����

```sh
bash deploy.sh install --ip 203.0.113.10 --zt-port 9993 --web-port 3443 --access public
```

������ `--ipv6 2001:db8::10`������������ʹ�� `--access local`������ HTTPS ����ʹ�� `--access proxy --origin https://control.example.com`���ű���ǩ�� HTTPS ֤�飬���Զ��޸��ư�ȫ�顣û�� Docker ʱ������ֵ�ذ�װ��ֹͣ����ʾ�Ȱ�װ Docker������ʽ��װ���ṩ��װѡ�

### �ֶ� Compose ����

Ҳ���������ã������н���ʽ�ű����˷�ʽĬ�Ͻ��������� 8080��

```sh
cp .env.example .env
chmod 600 .env
```

�༭ `.env`���� `YOUR_PUBLIC_IP` �����Լ��ĵ�ַ��

```dotenv
PLANET_ENDPOINTS=YOUR_PUBLIC_IP/9993
ZT_PORT=9993
WEB_PORT=8080
WEB_BIND_ADDRESS=127.0.0.1
ADMIN_PASSWORD_PATH=./secrets/admin-password
PUBLIC_ORIGIN=http://localhost:8080
COOKIE_SECURE=false
```

֧�ֶ��ŷָ��� IPv4 / IPv6������ `203.0.113.10/9993,2001:db8::10/9993`��ʹ�� IP/�˿ڸ�ʽ����ʹ�������������ַӦ��ָ��ͬһ�����𡣴˰汾���Զ����ÿ���������֡�

������ҳ����׼����ʼ�˺ţ�

```sh
docker build -t zerotier-control:local .
docker run --rm --user 0:0 --mount "type=bind,src=$PWD,dst=/work" \
  --workdir /work --entrypoint node zerotier-control:local scripts/password.js
```

���������Ḳ���������롣����������׷���

```sh
docker compose --env-file .env up -d --build --wait --wait-timeout 120
```

�޸� `ZT_PORT` ʱͬ���޸� `PLANET_ENDPOINTS` �еĶ˿ڡ��ֶ���ʽĬ��ֻ���� `127.0.0.1:8080`�����Լ��ĵ��Խ��� SSH ������

```sh
ssh -L 8080:127.0.0.1:8080 root@YOUR_SERVER
```

�� <http://localhost:8080>��ʹ�� `admin / admin` ��¼������״��˺����á����ʵ�ַӦ�� `PUBLIC_ORIGIN` һ�¡�

������ʹ�� `privileged` ����� Docker socket��������ֻ�е����ڵ�����÷��񣬲��������磬���� TUN �豸��������˹���������������ռ䣬ͨ�� Unix socket ������ҳ��ڡ�

## �ͻ��˽���

1. ����ҳ��Planet ��ͻ��ˡ����� `planet`��
2. �ڿͻ���ֹͣ ZeroTier ���񣬱���ԭ `planet`���滻Ϊ�����ļ���Ȼ����������
3. ����ҳ�������磬�� `10.42.0.0/24`���������� ID��
4. �ͻ��˼�������磬����ҳ��Ա�б���Ȩ���豸��
5. ȷ�Ͽͻ��˻�ȡ��ַ��`zerotier-cli peers` �и��ڵ��ɫΪ `PLANET`����ַΪ�Լ��ķ�������

| �ͻ��� | Planet ·�� |
| --- | --- |
| Windows | `C:\ProgramData\ZeroTier\One\planet` |
| Linux | `/var/lib/zerotier-one/planet` |
| macOS | `/Library/Application Support/ZeroTier/One/planet` |

�� Linux Ϊ�����ڱ����ԭ�ļ���

```sh
sudo systemctl stop zerotier-one
sudo cp ./planet /var/lib/zerotier-one/planet
sudo systemctl start zerotier-one
sudo zerotier-cli join YOUR_NETWORK_ID
sudo zerotier-cli peers
```

Windows ʹ�ù���ԱȨ��ֹͣ������ ZeroTier One ���񡣹ٷ� Android/iOS Ӧ�ò��ṩ�����Խ� Planet �Ľ��棬��ʹ��֧�ָù��ܵĿͻ��ˣ��òֿⲻ�����ƶ��˿ͻ��ˡ�

## ������ HTTPS

��װʱ��ֱ��ѡ������ HTTPS �������������д�������ڷ������� HTTPS ��������У�������ת���� `127.0.0.1:3443`�����Լ��� Web �˿ڣ�������ԭʼ `Host`��

�Ѿ������Ҳ���޸� `.env`��

```dotenv
PUBLIC_ORIGIN=https://control.example.com
COOKIE_SECURE=true
WEB_BIND_ADDRESS=127.0.0.1
```

Ȼ������ `bash deploy.sh install`����ҳ������������·������֧�� `/control/` ��·����SSH ���� HTTP ����ʹ�� `COOKIE_SECURE=false`��HTTPS ʹ�� `true`��

## �ļ��־û��ͱ���

���ݾ���;��

| �� | �������� |
| --- | --- |
| `zerotier-data` | �ڵ����ݡ�Planet ǩ����Կ��Planet��`controller.d` ����ͳ�Ա���� |
| `planet-files` | �ͻ��� Planet ������Ԫ���� |
| `controller-access` | ���������� API ��Կ��ֻ�ṩ��������� |
| `control-data` | ��ҳ������־ |
| `control-socket` | �����ͨ�� socket |

�������ؽ������Ḵ�����ݡ�ǩ����Կ�� Planet����Ҫɾ�����ݾ���`docker compose down` ��������`down -v` ��ɾ���������ݡ�

���нű����һ���Ա��ݣ�������ͣ���񣬸������ݺ�ָ�����ǰ���еķ���ʧ��ʱҲ�᳢�Իָ���

```sh
bash deploy.sh backup
```

���ݱ��浽 `backups/ʱ���/`������ `zerotier-one/`�����ݡ�ǩ����Կ��Planet �����磩��`web-data/`������Ա�˺Ź�ϣ���״�����״̬�Ͳ�����־����`.env`��`admin-password` ��Դ��汾��¼��Ŀ¼Ȩ�� 700������˽Կ�����룬����ܱ��ܡ��ָ�ʱ�� `web-data/` ���ݻָ��� Web ���ݾ���������ʼ�����ļ��Ż� `.env` �� `ADMIN_PASSWORD_PATH`����ǰδ�ṩ�Զ��ָ������ҳ���������� JSON **���������������**��

������Ŀ��

```sh
bash deploy.sh update
```

���»����������ݣ��ٿ����ȡԴ�롢�ؽ�����������ԭ���ݡ�Planet�����������������á���δ�ύ��Դ���޸�ʱֹͣ���¡����� ZIP��û�� Git �ֿ��ֻ���ؽ���ǰԴ��ʱ��ʹ�� `bash deploy.sh update --skip-pull`��

Ĭ�ϲ����Զ��������� `latest`���°� ZeroTier ������Ŀ��������Դ���У��ֵ����ͨ�����ɲ��ԡ����Ĺ�����ַ����������ʾ���ñ仯�����ȱ��ݡ�ͣ�����׷�������ʽ�������� Planet��

```sh
docker compose stop
docker compose run --rm --no-deps controller --regenerate
docker compose up -d --force-recreate --wait
```

�������ɻᱣ���ڵ����ݺ�ǩ����Կ��Ϊȷ�����пͻ��˽����µ�ַ��Ӧ�������ء��ַ��ͻ����ļ���ȱ��һ��ǩ����Կʱ�����Զ���������Կ����ָ��������ݡ�

## �����˺�������

����Ա�û�����scrypt �����ϣ���״�����״̬������ Web ���ݾ� `/app/data/admin-account.json`���ļ�Ȩ�� 600����ʹ������κ� scrypt �������룬�������ģ���̨���᷵��������ϣ��������־����¼���롣`secrets/admin-password` Ҳֻ���� scrypt ��ϣ������û���˺��ļ�ʱ�ĳ�ʼ�����������޸ĺ�ĵ�¼���롣�������ظ���װ���±��ݻ��Զ�ת���ɵ����ĳ�ʼ�����ļ���ֱ������ Node ʱҲĬ�ϳ�ʼ�� `admin / admin`������ `ADMIN_PASSWORD_FILE` �� `ADMIN_PASSWORD_HASH` �ṩ��ʼ����ϣ�������˺��ļ�ʱ����ʹ�ó־û��˺š�

�����û���������ʱ���ڷ�������ĿĿ¼�� root ִ�У�

```sh
bash deploy.sh reset-password
```

�ű����������ݣ���ֹͣ Web���������˺�����Ϊ `admin / admin` ���������´ε�¼���������޸����Planet��ZeroTier ���ݺ��������ݼ������á��ֶ� Compose ������ȱ��ݲ�ֹͣ `control`�������� `docker compose run --rm --no-deps --entrypoint node control scripts/reset-account.js`������������� `control` �� `gateway`��

## Docker �� GitHub ���ؼ���

����ĿĿ¼���У�

```sh
bash deploy.sh downloads
bash deploy.sh install
```

��·�˵�������������Դ���Զ���͹ٷ�ֱ����������·ѡ��Ŀǰʹ�� [1Panel ����վ](https://docker.1panel.dev/) �� [GH-Proxy](https://gh-proxy.com/docs/github-accelerator)�����ڵ�������������ʵ�ʿ����Ժ��ٶ�ȡ���ڷ�������·������ʱ������

Ҳ��һ��ָ�������棺

```sh
bash deploy.sh downloads --docker-registry docker.1panel.dev --github-proxy https://gh-proxy.org/
bash deploy.sh install
```

���ñ�����Ȩ�� 600 �� `.download.env`�����ύ�� Git��

```dotenv
DOCKER_REGISTRY=docker.1panel.dev
GITHUB_PROXY=https://gh-proxy.org/
```

Docker ���������� **Node��Debian��Python �� Nginx**����ֱ��ָ������Ŀ����ֿ⣬���Ǿ�����ȡ�� Dockerfile �� `FROM`�����޸� `/etc/docker/daemon.json`������Ҫ���� Docker��Ҳ���������� BuildKit �Ƿ��ȡ Docker ���ػ��������á��Խ�Դ��֧�� `/v2/` Registry API �� `library/������`������ `registry.example.com/library/node:24-bookworm-slim`��[Docker ����վ˵��](https://docs.docker.com/docker-hub/image-library/mirror/)

GitHub ���������� ZeroTier Դ��鵵���غͽű��еĲֿ���¡�������֧�� `ǰ׺/https://github.com/...`������ `git pull` ʱ����֧�� Git Smart HTTP��������ι����ֿ���ȡ���õ�ַ�滻����дȫ�� Git ���á�Դ���ύ�� SHA-256 ���̶ֹ����������ش���ҳ���ͬ����ʱֹͣ���롣

�ֿ���δ���ء����ȡ�°�ű�Ҳ����ʱ��

```sh
# �״λ�ȡ��
git clone https://gh-proxy.org/https://github.com/SuzukiR1n/zerotier-control.git

# ���вֿ⣺�ڲֿ�����ʱͨ��������ȡ�°棬���޸� origin��
git -c 'url.https://gh-proxy.org/https://github.com/.insteadOf=https://github.com/' pull --ff-only
```

���״�ͨ��������¡��������� `origin` ��Ϊ�ٷ���ַ���Ա�������·�л�ʱ�����µ����ã�

```sh
git remote set-url origin https://github.com/SuzukiR1n/zerotier-control.git
```

�ָ�ֱ����`bash deploy.sh downloads --docker-registry docker.io --github-proxy direct`���ֶ� Compose ����Ҳ�ɶ�ȡ���ļ���`docker compose --env-file .env --env-file .download.env up -d --build --wait`��ֱ������ `docker build` ʱ���� `--build-arg DOCKER_REGISTRY=��������`���������������ɴ��� `--build-arg GITHUB_PROXY=https://����ǰ׺/`��

### �����жϺ�ļ�����װ

������� `nginx:stable-alpine` ʱ���� `unexpected EOF`��`short read` ��ʱ��˵�� Docker û��ȡ���������ؽ��������ԭ����������硢��������Դ���ű�������������ǰ��ȡ��ҳ��ھ���ʧ��ʱ��ೢ�� 3 �Σ���� 5 ��� 10 �룻ȫ��ʧ�ܺ������ú����ݲ��˳���

�������ؼ��ٺ�����ĿĿ¼������װ��

```sh
bash deploy.sh install
```

�ɰ�ű�Ҳ����ִ�� `docker compose pull gateway`���ɹ��������� `bash deploy.sh install`�������ص����������Ḵ�ã�����������д���� IP��������ʧ�ܣ��������� Docker �ػ�����ʹ�õĴ�������Դ�������õ�ǰ�ն˵Ĵ�����һ��Ӱ�� Docker ��ȡ��[Docker ������ȡ�����˵��](https://docs.docker.com/reference/cli/docker/image/pull/)

## ������ Web ����

������װ Node.js 24 ������ `npm run demo`������ <http://127.0.0.1:8080>����ʹ�ã�

```sh
docker compose -f deploy/compose.demo.yaml up -d --build
```

��ʾ�������룬ʹ��ģ�����ݣ������� Planet��������ʵ�ʿ����������������á�������Ϊ�������á�

## ��������֤

```sh
npm run check
npm test
python3 -m unittest discover -s test -p '*_test.py'
```

���� Windows �������ܴ��������ӽ���ʱ������ `node --test --test-isolation=none test/app.test.js test/planet.test.js test/deploy-config.test.js`��

GitHub Actions ��鲿��ű��﷨�� ShellCheck�������û�����¼���״�ǿ���޸ġ���ֹ�������á��˺ų־û��������״����á��ỰʧЧ��CSRF��Ƶ�����ơ�У��������Ա��������ʵ�������̽����ֻ������������� Registry����ͨ���� Registry ��ɹ������״ΰ�װ���ظ���װ�����ݸ��¡��������á��Ƴ����������°�װ����֤ Planet �����ݲ��䡢������Կ���˺����������ú���˺�ʧЧ��Ĭ���˺��ٴ�Ҫ���޸ģ��Լ�ʵ�� ZeroTier 1.16.2 �ͻ��˽���˽�� Planet����ҳ��Ȩ����ȡ��ַ��������֤ GitHub �����������ԡ�У�鲻��ʱֹͣ�����Ա��� Git ��ȡ��д��ַ����ģ�⾵����ȡ����ʧ�ܺ�ָ�������ʧ�ܺ��˳��Ҳ��ؽ������������ͻ��˲��Ե���ʹ�� TUN Ȩ�ޣ���������������Ҫ��ЩȨ�ޡ�

CI ʹ�ø���Ĳ��Ե�ַ���������ʱ���ݣ���֤��ʵ�ʹ�����·��NAT ��͸�������ȶ��ԡ��������Ӧ���Լ����豸��ȷ�����ӡ�

## �汾��Χ

v0.4.0 �ṩ������·���á�����ű����������ڵ�Ϳ���������������Ա����δ�ṩ����������л������û�Ȩ�ޡ�Flow Rules DSL �༭��Moon �������Զ����ݻָ����޸���ͨ��������ֻ���Ͷ�Ӧ�ֶΣ��������и߼����á�

��Ա�б���ʾ��Ȩ״̬������ʵʱ���߱����ڵ�����ҳ��ʾ������������ `/peer` ·����ɾ�������������ĳ�Ա�󣬸��豸�Կ����ٴγ����ڴ���Ȩ�б���

## ��Դ������

- [ZeroTier �ٷ�Դ���� 1.16.2](https://github.com/zerotier/ZeroTierOne/tree/1.16.2)
- [ZeroTier �������ĵ�](https://docs.zerotier.com/controller/)
- [ZeroTier World ��ʽ](https://github.com/zerotier/ZeroTierOne/blob/1.16.2/node/World.hpp)
- [���������������˵��](NOTICE.md)

��ĿĿ��ο��� [docker-zerotier-planet](https://github.com/xubiaolin/docker-zerotier-planet)��Web �Ͳ��𹤾�Ϊ��ʵ�֡��� ZeroTier, Inc. ��������ϵ��ZeroTier �̱���������ߡ�
