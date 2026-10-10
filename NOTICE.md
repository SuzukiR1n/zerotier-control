# Third-party components

The Web UI, Node.js backend, bootstrap scripts and newly implemented Planet utility in this repository are MIT licensed. They are independently developed and are not endorsed by ZeroTier, Inc.

`Dockerfile.zerotier` builds ZeroTier One **1.16.2** from upstream commit `fe29cd88886e4f58547ba7f740b2d73eb49ab222`. This repository does not relicense ZeroTier. The upstream sources are not modified; build options explicitly enable the local controller (`ZT_NONFREE=1`) and disable optional SSO/exporter integrations. The Planet utility links the public World/ECC SDK.

- ZeroTier agent and SDK: [Mozilla Public License 2.0](https://github.com/zerotier/ZeroTierOne/blob/1.16.2/LICENSE-MPL.txt).
- ZeroTier controller (`nonfree/`): [ZeroTier Source-Available License, Version 1.0](https://github.com/zerotier/ZeroTierOne/blob/1.16.2/nonfree/LICENSE.md). Its non-commercial permission is limited to the uses defined by upstream. Commercial use, including business environments and service offerings as defined there, requires a separate upstream license.
- Bundled upstream dependencies retain their original licenses. The controller image includes upstream license texts under `/usr/share/licenses/zerotier`.
- Node.js, Python, Debian and Nginx images retain their respective licenses.

Upstream source archive: <https://codeload.github.com/zerotier/ZeroTierOne/tar.gz/fe29cd88886e4f58547ba7f740b2d73eb49ab222>

Archive SHA-256: `e4d4e5f6f2fba4d29b0358907a178965588cd1e8c6ae4affbed626e96856f51b`.

`docker-zerotier-planet` inspired this project's deployment goal. Its ztncui sources, deployment scripts and retired world generator are not included in this repository.
