import { copyText } from './clipboard.js';

const root = document.querySelector('#app'), modal = document.querySelector('#modal');
const state = { view: 'overview', tab: 'members', networks: [], members: [], peers: [], audit: [], planet: null, selected: null, status: null, query: '', filter: 'all', busy: false, session: null, error: '', refreshed: null };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const attr = escape;
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  network: '<path d="M12 8v7M5 15h14M5 15v3m14-3v3"/><rect x="8" y="2" width="8" height="6" rx="2"/><rect x="2" y="18" width="6" height="4" rx="1"/><rect x="16" y="18" width="6" height="4" rx="1"/>',
  users: '<path d="M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2m22 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="8" cy="7" r="4"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  refresh: '<path d="M20 7a9 9 0 1 0 1 8M20 2v5h-5"/>', search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
  moon: '<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>',
  log: '<path d="M8 3H5v18h14V3h-3M9 2h6v4H9Zm-1 9h8m-8 4h8m-8 4h5"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  terminal: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m6 9 3 3-3 3m6 0h5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7Z"/>', logout: '<path d="M9 5H3v14h6m6-14 7 7-7 7m-7-7h14"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.network}</svg>`;
const button = (label, action, cls = '', data = '') => `<button class="btn ${cls}" data-action="${action}" ${data}>${label}</button>`;
const badge = (text, kind = '') => `<span class="badge ${kind}">${escape(text)}</span>`;
const formatTime = x => x ? new Date(x).toLocaleString('zh-CN', { hour12: false }) : '—';
let toastTimer;
function toast(message, error = false) { const el = document.querySelector('#toast'); el.textContent = message; el.className = error ? 'show error' : 'show'; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = ''; }, 4200); }
async function api(path, method = 'GET', value) {
  const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(state.session?.csrf ? { 'X-CSRF-Token': state.session.csrf } : {}) }, body: value === undefined ? undefined : JSON.stringify(value) });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/login') { state.session = { authenticated: false }; render(); }
    if (data.code === 'CREDENTIAL_CHANGE_REQUIRED') { state.session.mustChangeCredentials = true; render(); }
    throw new Error(data.error || `请求失败（${response.status}）`);
  }
  return data;
}
function logo() { return '<img src="/favicon.svg" width="36" height="36" alt=""><div><strong>ZeroTier<span> Control</span></strong><small>SELF-HOSTED NETWORKS</small></div>'; }
function accountForm(firstLogin = false) {
  return `<form id="account-form">${firstLogin ? '<div class="notice">请同时修改用户名和密码，保存后即可管理网络。</div>' : '<p class="muted">保存后，其他已登录会话会失效。</p>'}<label for="account-username">${firstLogin ? '新用户名' : '用户名'}</label><input id="account-username" name="username" autocomplete="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,31}" value="${firstLogin ? '' : attr(state.session.user)}" placeholder="3–32 个字母、数字、下划线、点或连字符">${firstLogin ? '' : '<label for="current-password">当前密码</label><input id="current-password" name="currentPassword" type="password" autocomplete="current-password" required maxlength="256">'}<label for="new-password">新密码</label><input id="new-password" name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="256" placeholder="至少 12 个字符"><label for="confirm-password">确认新密码</label><input id="confirm-password" name="confirmPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="256" placeholder="再次输入新密码"><p class="form-error" id="account-error" role="alert"></p><button class="btn primary wide" type="submit">${firstLogin ? '保存并进入管理面板' : '保存账号设置'} ${icon('arrow')}</button>${firstLogin ? button('退出登录', 'logout', 'wide subtle', 'type="button"') : ''}</form>`;
}
function accountPage() {
  return `<div class="page-heading"><div><p class="eyebrow">ACCOUNT</p><h1>账号设置</h1><p class="muted">管理你的登录用户名和密码。</p></div></div><section class="panel settings-panel account-panel">${state.session.demo ? '<p class="muted">演示模式不能修改管理账号。</p>' : accountForm()}</section>`;
}
function login() {
  const firstLogin = !!state.session?.mustChangeCredentials;
  const form = firstLogin ? accountForm(true) : `<form id="login-form"><label for="username">用户名</label><input id="username" name="username" autocomplete="username" required maxlength="32" placeholder="输入用户名"><label for="password">密码</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256" placeholder="输入密码"><p class="form-error" id="login-error" role="alert"></p><button class="btn primary wide" type="submit">登录管理面板 ${icon('arrow')}</button></form>`;
  root.innerHTML = `<main class="login-layout"><section class="login-art"><div class="brand">${logo()}</div><div><span class="eyebrow">YOUR NETWORK. YOUR CONTROL.</span><h1>距离更远，<br>连接依然简单。</h1><p>在自己的服务器上，管理自己的网络。</p><div class="login-mesh" aria-hidden="true">${icon('network')}</div></div><small>ZeroTier Control · 自托管网络管理</small></section><section class="login-form"><div class="form-card"><div class="mini-mark">${icon('shield')}</div><h2>${firstLogin ? '设置你的管理账号' : '欢迎回来'}</h2><p class="muted">${firstLogin ? '首次登录需要修改用户名和密码' : '登录你的网络管理空间'}</p>${form}<p class="login-foot">${icon('lock')} 安全会话 · 密钥仅保存在服务器</p></div></section></main>`;
}
function sidebar() {
  return `<aside class="sidebar"><a class="brand" href="#overview" data-action="overview" aria-label="ZeroTier Control 网络总览">${logo()}</a><div class="workspace-label">工作空间</div><nav aria-label="主导航">${[['overview', 'grid', '网络总览'], ['networks', 'network', '全部网络'], ['peers', 'bolt', '节点连接'], ['planet', 'download', 'Planet 与客户端'], ['audit', 'log', '操作记录'], ['about', 'settings', '控制器信息'], ['account', 'lock', '账号设置']].map(([view, symbol, label]) => `<button data-action="${view}" aria-label="${label}" title="${label}" class="nav-item ${state.view === view ? 'active' : ''}">${icon(symbol)}<span>${label}</span>${view === 'networks' ? `<small>${state.networks.length}</small>` : ''}</button>`).join('')}</nav><div class="side-bottom"><div class="controller-mini"><span class="status-dot ${state.status ? '' : 'gray'}"></span><div><strong>${state.status ? '控制器已连接' : '控制器未连接'}</strong><code>${escape(state.status?.address ?? '等待连接')}</code></div></div><div class="side-actions">${button(icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'), 'theme', 'icon-btn', 'aria-label="切换明暗主题" title="切换明暗主题"')}<span>v0.4.3</span>${button(icon('logout'), 'logout', 'icon-btn', 'aria-label="退出登录" title="退出登录"')}</div></div></aside>`;
}
function errorBanner() { return state.error ? `<div class="error-banner" role="alert">${escape(state.error)} ${button('重试', 'refresh', 'small')}</div>` : ''; }
function searchBox(placeholder = '搜索网络名称或 ID') { return `<div class="search-box">${icon('search')}<input aria-label="${placeholder}" id="search" type="search" placeholder="${placeholder}" value="${attr(state.query)}"></div>`; }
function networkCards() {
  const query = state.query.toLowerCase();
  const networks = state.networks.filter(n => `${n.name} ${n.id}`.toLowerCase().includes(query));
  return networks.length ? `<div class="network-grid">${networks.map((n, i) => `<article class="network-card"><div class="card-top"><div class="network-symbol tone-${i % 3}">${icon('network')}</div>${badge(n.private ? '私有网络' : '公开网络', n.private ? 'neutral' : 'amber')}</div><button class="card-title" data-action="open" data-id="${attr(n.id)}">${escape(n.name || '未命名网络')}</button><div class="network-id"><code>${escape(n.id)}</code>${button(icon('copy'), 'copy', 'icon-btn small', `data-value="${attr(n.id)}" aria-label="复制网络 ID"`)}</div><div class="card-info"><span>${icon('users')}${Number(n.memberCount ?? 0)} 个成员</span><code>${escape(n.routes?.find(r => !r.via)?.target ?? '未配置子网')}</code></div><div class="card-footer"><span>${n.v4AssignMode?.zt ? 'IPv4 自动分配' : '手动地址分配'}</span>${button(`管理网络 ${icon('arrow')}`, 'open', 'link-btn', `data-id="${attr(n.id)}"`)}</div></article>`).join('')}</div>` : empty('还没有匹配的网络', state.networks.length ? '尝试其他名称或网络 ID。' : '创建第一个网络，让设备在任何地方相连。', state.networks.length ? '' : button(`${icon('plus')} 创建网络`, 'create', 'primary'));
}
function empty(title, subtitle, action = '') { return `<div class="empty">${icon('network')}<h3>${title}</h3><p>${subtitle}</p>${action}</div>`; }
function overview() {
  return `<div class="page-heading"><div><p class="eyebrow">CONTROL CENTER</p><h1>网络总览</h1><p class="muted">连接你的设备，掌握每一个网络。</p></div>${button(`${icon('plus')} 创建网络`, 'create', 'primary')}</div><section class="hero"><div><div class="hero-kicker"><span class="status-dot"></span> 你的网络，由你掌控</div><h2>把不同地点的设备，<br>放进同一个网络。</h2><p>从家庭实验室到远程工作空间，一处管理所有连接。</p><a href="#networks" data-action="networks">查看全部网络 ${icon('arrow')}</a></div><div class="mesh-art" aria-hidden="true"><svg viewBox="0 0 400 220"><g class="mesh-lines"><path d="M200 111 75 42M200 111l127-69M200 111 60 171M200 111l272-6M200 111l111 74M200 111l-32 89"/></g><circle class="mesh-orbit" cx="200" cy="111" r="74"/><circle class="mesh-orbit" cx="200" cy="111" r="100"/><g class="mesh-nodes"><circle cx="75" cy="42" r="10"/><circle cx="327" cy="42" r="8"/><circle cx="60" cy="171" r="7"/><circle cx="311" cy="185" r="10"/><circle cx="168" cy="200" r="7"/></g><rect class="mesh-center" x="171" y="82" width="58" height="58" rx="17"/><path class="mesh-cube" d="m186 102 14-8 14 8v17l-14 8-14-8Zm0 0 14 9 14-9m-14 9v16"/><g class="mesh-labels"><text x="40" y="22">HOME</text><text x="307" y="22">WORK</text><text x="293" y="217">ANYWHERE</text></g></svg></div></section><div class="stats-grid">${[['network', '网络总数', state.networks.length, '独立管理每一个网络'], ['users', '已登记成员', state.networks.reduce((n, x) => n + Number(x.memberCount ?? 0), 0), '成员数不代表在线数量'], ['shield', '私有网络', state.networks.filter(n => n.private).length, '通过成员授权控制访问']].map(([symbol, label, count, hint]) => `<div class="stat"><div><span>${label}</span><strong>${count.toString().padStart(2, '0')}</strong><small>${hint}</small></div><div class="stat-icon">${icon(symbol)}</div></div>`).join('')}</div><div class="section-heading"><h2>我的网络 <span>${state.networks.length}</span></h2>${searchBox()}</div><div id="network-results">${networkCards()}</div><div class="tip-strip">${icon('shield')}<span>新网络默认设为私有。设备加入后，在成员列表中确认并授权。</span></div>`;
}
function networksPage() { return `<div class="page-heading"><div><p class="eyebrow">NETWORKS</p><h1>全部网络</h1><p class="muted">管理网络、成员与地址分配。</p></div>${button(`${icon('plus')} 创建网络`, 'create', 'primary')}</div><div class="section-heading"><h2>${state.networks.length} 个网络</h2>${searchBox()}</div><div id="network-results">${networkCards()}</div>`; }
function memberRows() {
  const members = state.members.filter(m => `${m.name} ${m.id} ${(m.ipAssignments ?? []).join(' ')}`.toLowerCase().includes(state.query.toLowerCase())).filter(m => state.filter === 'all' || (state.filter === 'authorized' ? m.authorized : !m.authorized));
  return members.length ? `<div class="table-scroll"><table><thead><tr><th>设备 / 节点 ID</th><th>授权状态</th><th>分配的 IP</th><th>客户端版本</th><th class="align-right">操作</th></tr></thead><tbody>${members.map(m => `<tr><td><div class="device-cell"><div class="device-icon">${icon(m.activeBridge ? 'network' : 'terminal')}</div><div><strong>${escape(m.name || '未命名设备')}</strong><code>${escape(m.id)}</code></div></div></td><td>${badge(m.authorized ? '已授权' : '待授权', m.authorized ? 'green' : 'amber')}</td><td><div class="ip-list">${(m.ipAssignments ?? []).map(ip => `<code>${escape(ip)}</code>`).join('') || '<span class="muted">等待分配</span>'}</div>${m.activeBridge ? '<small class="muted">允许桥接</small>' : ''}</td><td class="muted">${m.vMajor !== undefined ? escape(`${m.vMajor}.${m.vMinor}.${m.vRev}`) : '—'}</td><td class="align-right"><div class="row-actions">${button(m.authorized ? '撤销授权' : '授权', m.authorized ? 'deauthorize' : 'authorize', m.authorized ? 'small subtle' : 'small primary', `data-id="${attr(m.id)}"`)}${button('编辑', 'edit-member', 'small', `data-id="${attr(m.id)}"`)}</div></td></tr>`).join('')}</tbody></table></div>` : empty('没有匹配的成员', '让设备加入此网络，或使用“添加成员”预先登记节点。');
}
function membersPanel() {
  const pending = state.members.filter(m => !m.authorized).length;
  return `${pending ? `<div class="notice amber"><div>${icon('shield')}<span><strong>${pending} 个设备等待授权</strong> · 请核对节点 ID 后允许接入。</span></div></div>` : ''}<div class="section-heading"><div class="segments" aria-label="筛选成员">${[['all', '全部成员', state.members.length], ['authorized', '已授权', state.members.length - pending], ['pending', '待授权', pending]].map(([x, label, n]) => `<button class="${state.filter === x ? 'active' : ''}" data-action="filter" data-filter="${x}">${label} <span>${n}</span></button>`).join('')}</div><div class="toolbar">${searchBox('搜索设备、节点 ID 或 IP')}${button(`${icon('plus')} 添加成员`, 'add-member', 'small')}</div></div><div class="panel" id="member-results">${memberRows()}</div><p class="table-note">授权表示允许访问网络；控制器成员接口不提供可靠的实时在线状态。</p>`;
}
function field(label, name, value = '', type = 'text', hint = '') { return `<label>${label}<input name="${name}" type="${type}" value="${attr(value)}" ${type === 'number' ? 'step="1"' : 'maxlength="253"'}>${hint ? `<small>${hint}</small>` : ''}</label>`; }
function checkbox(label, name, checked, hint = '') { return `<label class="check-field"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span><strong>${label}</strong>${hint ? `<small>${hint}</small>` : ''}</span></label>`; }
function networkSettings() {
  const n = state.selected;
  return `<form id="settings-form" class="settings-layout"><section class="panel settings-panel"><h2>基本设置</h2><p class="muted">修改网络名称与访问方式。</p>${field('网络名称', 'name', n.name)}<div class="field-grid">${field('MTU', 'mtu', n.mtu ?? 2800, 'number')}${field('多播订阅上限', 'multicastLimit', n.multicastLimit ?? 32, 'number')}</div>${checkbox('私有网络', 'private', n.private, '只有已授权成员才能访问')}${checkbox('允许广播', 'enableBroadcast', n.enableBroadcast)}<h2 class="subheading">地址分配</h2>${checkbox('IPv4 自动分配', 'v4', n.v4AssignMode?.zt)}${checkbox('IPv6 自动分配', 'v6zt', n.v6AssignMode?.zt)}${checkbox('IPv6 RFC 4193', 'rfc4193', n.v6AssignMode?.rfc4193)}${checkbox('IPv6 6plane', 'sixplane', n.v6AssignMode?.['6plane'])}</section><section class="panel settings-panel"><h2>DNS</h2><p class="muted">客户端需要启用 allowDNS 才会应用设置。</p>${field('搜索域名', 'domain', n.dns?.domain ?? '', 'text', '留空表示不设置搜索域')}${field('DNS 服务器', 'servers', (n.dns?.servers ?? []).join(', '), 'text', '多个 IPv4 / IPv6 地址用逗号分隔')}<div class="form-footer">${button('保存设置', 'submit-settings', 'primary', 'type="submit"')}</div><div class="danger-zone"><h3>删除网络</h3><p>网络与成员配置将被删除，所有成员会失去此网络的访问权限。</p>${button('删除此网络', 'delete-network', 'danger')}</div></section></form>`;
}
function routesPanel() {
  const n = state.selected;
  return `<div class="settings-layout"><section class="panel settings-panel"><div class="section-heading"><div><h2>托管路由</h2><p class="muted">将目的子网发送给网络成员。</p></div>${button(`${icon('plus')} 添加`, 'add-route', 'small')}</div>${n.routes?.length…4546 tokens truncated…'add-member' || action === 'edit-member') {
    const m = state.members.find(x => x.id === id) ?? {};
    showModal(action === 'add-member' ? '添加成员' : '编辑成员', `${action === 'add-member' ? field('节点 ID（10 位十六进制）', 'id') : `<p class="muted">节点 <code>${escape(id)}</code></p>`}${field('设备名称', 'name', m.name ?? '')}${field('固定 IP 地址', 'ips', (m.ipAssignments ?? []).join(', '), 'text', '多个地址用逗号分隔，留空交由自动分配；填写 IP，不含子网掩码')}${checkbox('允许访问网络', 'authorized', m.authorized)}${checkbox('允许以太网桥接', 'activeBridge', m.activeBridge)}${checkbox('关闭此成员的自动 IP 分配', 'noAutoAssignIps', m.noAutoAssignIps)}${id ? button('删除成员…', 'delete-member', 'danger small', `type="button" data-id="${attr(id)}"`) : ''}`, async d => {
      const mid = id ?? String(d.get('id')).trim().toLowerCase(); if (!/^[0-9a-f]{10}$/.test(mid)) throw new Error('节点 ID 必须为 10 位十六进制');
      await api(`/networks/${n.id}/members/${mid}`, 'PATCH', { name: d.get('name'), ipAssignments: String(d.get('ips')).split(',').map(x => x.trim()).filter(Boolean), authorized: d.has('authorized'), activeBridge: d.has('activeBridge'), noAutoAssignIps: d.has('noAutoAssignIps') }); toast('成员配置已保存');
    });
  } else if (action === 'delete-member') { modal.close(); confirmAction('删除成员', '会先撤销授权，再删除成员记录。仍在尝试加入的在线设备可能重新出现。', d => api(`/networks/${n.id}/members/${id}`, 'DELETE', { confirm: d.get('confirm') }), id); }
  else if (action === 'delete-network') confirmAction('删除网络', '此操作将删除网络和全部成员配置。请先导出并备份控制器数据。', async d => { await api(`/networks/${n.id}`, 'DELETE', { confirm: d.get('confirm') }); state.view = 'networks'; state.selected = null; }, n.id);
  else if (action === 'add-route') showModal('添加托管路由', `${field('目标子网（CIDR）', 'target', '10.20.0.0/24')}${field('网关 IP', 'via', '', 'text', '直连路由留空。默认路由需要客户端允许 allowDefault。')}`, d => patchNetwork({ routes: [...(n.routes ?? []), { target: d.get('target').trim(), via: d.get('via').trim() || null }] }));
  else if (action === 'add-pool') showModal('添加地址池', `${field('起始 IP', 'ipRangeStart', '10.10.0.10')}${field('结束 IP', 'ipRangeEnd', '10.10.0.250')}<p class="muted">需要在对应子网中配置直连路由并启用自动分配。</p>`, d => patchNetwork({ ipAssignmentPools: [...(n.ipAssignmentPools ?? []), Object.fromEntries(d)] }));
  else if (action === 'remove-route' || action === 'remove-pool') { const key = action === 'remove-route' ? 'routes' : 'ipAssignmentPools'; confirmAction('删除配置项', '可能影响成员的路由或地址分配。', () => patchNetwork({ [key]: n[key].filter((_, i) => i !== Number(el.dataset.index)) })); }
  else if (action === 'join') showModal('让设备加入网络', `<p>先从“Planet 与客户端”下载并安装 planet 文件、重启客户端服务，再输入下面的网络 ID。最后回到成员列表完成授权。</p><div class="copy-block"><code>${escape(n.id)}</code>${button(icon('copy'), 'copy', 'icon-btn', `type="button" data-value="${attr(n.id)}" aria-label="复制网络 ID"`)}</div><p class="muted">也可以在安装了 ZeroTier 的客户端执行：</p><div class="copy-block"><code>zerotier-cli join ${escape(n.id)}</code>${button(icon('copy'), 'copy', 'icon-btn', `type="button" data-value="zerotier-cli join ${attr(n.id)}" aria-label="复制加入命令"`)}</div>`, async () => {}, '完成');
  else if (action === 'export') {
    const data = await api(`/networks/${n.id}/export`); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `network-${n.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('配置已导出（完整备份还需保存控制器数据）');
  }
}
document.addEventListener('click', async event => {
  const el = event.target.closest('[data-action]'); if (!el) return;
  if (el.dataset.action === 'submit-settings') return;
  event.preventDefault(); if (el.disabled) return; el.disabled = true;
  try { await doAction(el.dataset.action, el); } catch (e) { toast(e.message, true); } finally { el.disabled = false; }
});
document.addEventListener('input', event => {
  if (event.target.id !== 'search') return; state.query = event.target.value;
  const results = document.querySelector(state.view === 'detail' ? '#member-results' : '#network-results');
  if (results) results.innerHTML = state.view === 'detail' ? memberRows() : networkCards();
});
document.addEventListener('submit', async event => {
  if (!['login-form', 'account-form', 'settings-form'].includes(event.target.id)) return; event.preventDefault(); const el = event.submitter; el.disabled = true;
  try {
    const d = new FormData(event.target);
    if (event.target.id === 'login-form') { state.session = await api('/login', 'POST', { username: d.get('username').trim(), password: d.get('password') }); render(); await refresh(); }
    else if (event.target.id === 'account-form') {
      const firstLogin = state.session.mustChangeCredentials;
      state.session = await api('/account', 'POST', { ...Object.fromEntries(d), username: d.get('username').trim() });
      if (firstLogin) state.view = 'overview';
      render(); toast('用户名和密码已保存'); await refresh();
    }
    else {
      await patchNetwork({ name: d.get('name'), private: d.has('private'), enableBroadcast: d.has('enableBroadcast'), mtu: Number(d.get('mtu')), multicastLimit: Number(d.get('multicastLimit')), v4AssignMode: { zt: d.has('v4') }, v6AssignMode: { zt: d.has('v6zt'), rfc4193: d.has('rfc4193'), '6plane': d.has('sixplane') }, dns: { domain: d.get('domain').trim(), servers: d.get('servers').split(',').map(x => x.trim()).filter(Boolean) } }); await refresh();
    }
  } catch (e) {
    const error = document.querySelector(event.target.id === 'login-form' ? '#login-error' : event.target.id === 'account-form' ? '#account-error' : '#unused-form-error');
    if (error) error.textContent = e.message; else toast(e.message, true);
  }
  finally { el.disabled = false; }
});
try { document.documentElement.dataset.theme = localStorage.getItem('ztc-theme') ?? 'light'; } catch { document.documentElement.dataset.theme = 'light'; }
try { state.session = await api('/session'); render(); if (state.session.authenticated) await refresh(); } catch (e) { root.innerHTML = `<div class="empty"><h1>无法连接管理服务</h1><p>${escape(e.message)}</p><a href="/">重新加载</a></div>`; }
