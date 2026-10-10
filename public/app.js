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
const formatTime = x => x ? new Date(x).toLocaleString('zh-CN', { hour12: false }) : '��';
let toastTimer;
function toast(message, error = false) { const el = document.querySelector('#toast'); el.textContent = message; el.className = error ? 'show error' : 'show'; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.className = ''; }, 4200); }
async function api(path, method = 'GET', value) {
  const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(state.session?.csrf ? { 'X-CSRF-Token': state.session.csrf } : {}) }, body: value === undefined ? undefined : JSON.stringify(value) });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/login') { state.session = { authenticated: false }; render(); }
    if (data.code === 'CREDENTIAL_CHANGE_REQUIRED') { state.session.mustChangeCredentials = true; render(); }
    throw new Error(data.error || `����ʧ�ܣ�${response.status}��`);
  }
  return data;
}
function logo() { return '<img src="/favicon.svg" width="36" height="36" alt=""><div><strong>ZeroTier<span> Control</span></strong><small>SELF-HOSTED NETWORKS</small></div>'; }
function accountForm(firstLogin = false) {
  return `<form id="account-form">${firstLogin ? '<div class="notice">��ͬʱ�޸��û��������룬����󼴿ɹ������硣</div>' : '<p class="muted">����������ѵ�¼�Ự��ʧЧ��</p>'}<label for="account-username">${firstLogin ? '���û���' : '�û���'}</label><input id="account-username" name="username" autocomplete="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,31}" value="${firstLogin ? '' : attr(state.session.user)}" placeholder="3�C32 ����ĸ�����֡��»��ߡ�������ַ�">${firstLogin ? '' : '<label for="current-password">��ǰ����</label><input id="current-password" name="currentPassword" type="password" autocomplete="current-password" required maxlength="256">'}<label for="new-password">������</label><input id="new-password" name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="256" placeholder="���� 12 ���ַ�"><label for="confirm-password">ȷ��������</label><input id="confirm-password" name="confirmPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="256" placeholder="�ٴ�����������"><p class="form-error" id="account-error" role="alert"></p><button class="btn primary wide" type="submit">${firstLogin ? '���沢����������' : '�����˺�����'} ${icon('arrow')}</button>${firstLogin ? button('�˳���¼', 'logout', 'wide subtle', 'type="button"') : ''}</form>`;
}
function accountPage() {
  return `<div class="page-heading"><div><p class="eyebrow">ACCOUNT</p><h1>�˺�����</h1><p class="muted">������ĵ�¼�û��������롣</p></div></div><section class="panel settings-panel account-panel">${state.session.demo ? '<p class="muted">��ʾģʽ�����޸Ĺ����˺š�</p>' : accountForm()}</section>`;
}
function login() {
  const firstLogin = !!state.session?.mustChangeCredentials;
  const form = firstLogin ? accountForm(true) : `<form id="login-form"><label for="username">�û���</label><input id="username" name="username" autocomplete="username" required maxlength="32" placeholder="�����û���"><label for="password">����</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256" placeholder="��������"><p class="form-error" id="login-error" role="alert"></p><button class="btn primary wide" type="submit">��¼������� ${icon('arrow')}</button></form>`;
  root.innerHTML = `<main class="login-layout"><section class="login-art"><div class="brand">${logo()}</div><div><span class="eyebrow">YOUR NETWORK. YOUR CONTROL.</span><h1>�����Զ��<br>������Ȼ�򵥡�</h1><p>���Լ��ķ������ϣ������Լ������硣</p><div class="login-mesh" aria-hidden="true">${icon('network')}</div></div><small>ZeroTier Control �� ���й��������</small></section><section class="login-form"><div class="form-card"><div class="mini-mark">${icon('shield')}</div><h2>${firstLogin ? '������Ĺ����˺�' : '��ӭ����'}</h2><p class="muted">${firstLogin ? '�״ε�¼��Ҫ�޸��û���������' : '��¼�����������ռ�'}</p>${form}<p class="login-foot">${icon('lock')} ��ȫ�Ự �� ��Կ�������ڷ�����</p></div></section></main>`;
}
function sidebar() {
  return `<aside class="sidebar"><a class="brand" href="#overview" data-action="overview" aria-label="ZeroTier Control ��������">${logo()}</a><div class="workspace-label">�����ռ�</div><nav aria-label="������">${[['overview', 'grid', '��������'], ['networks', 'network', 'ȫ������'], ['peers', 'bolt', '�ڵ�����'], ['planet', 'download', 'Planet ��ͻ���'], ['audit', 'log', '������¼'], ['about', 'settings', '��������Ϣ'], ['account', 'lock', '�˺�����']].map(([view, symbol, label]) => `<button data-action="${view}" aria-label="${label}" title="${label}" class="nav-item ${state.view === view ? 'active' : ''}">${icon(symbol)}<span>${label}</span>${view === 'networks' ? `<small>${state.networks.length}</small>` : ''}</button>`).join('')}</nav><div class="side-bottom"><div class="controller-mini"><span class="status-dot ${state.status ? '' : 'gray'}"></span><div><strong>${state.status ? '������������' : '������δ����'}</strong><code>${escape(state.status?.address ?? '�ȴ�����')}</code></div></div><div class="side-actions">${button(icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'), 'theme', 'icon-btn', 'aria-label="�л���������" title="�л���������"')}<span>v0.4.0</span>${button(icon('logout'), 'logout', 'icon-btn', 'aria-label="�˳���¼" title="�˳���¼"')}</div></div></aside>`;
}
function errorBanner() { return state.error ? `<div class="error-banner" role="alert">${escape(state.error)} ${button('����', 'refresh', 'small')}</div>` : ''; }
function searchBox(placeholder = '�����������ƻ� ID') { return `<div class="search-box">${icon('search')}<input aria-label="${placeholder}" id="search" type="search" placeholder="${placeholder}" value="${attr(state.query)}"></div>`; }
function networkCards() {
  const query = state.query.toLowerCase();
  const networks = state.networks.filter(n => `${n.name} ${n.id}`.toLowerCase().includes(query));
  return networks.length ? `<div class="network-grid">${networks.map((n, i) => `<article class="network-card"><div class="card-top"><div class="network-symbol tone-${i % 3}">${icon('network')}</div>${badge(n.private ? '˽������' : '��������', n.private ? 'neutral' : 'amber')}</div><button class="card-title" data-action="open" data-id="${attr(n.id)}">${escape(n.name || 'δ��������')}</button><div class="network-id"><code>${escape(n.id)}</code>${button(icon('copy'), 'copy', 'icon-btn small', `data-value="${attr(n.id)}" aria-label="�������� ID"`)}</div><div class="card-info"><span>${icon('users')}${Number(n.memberCount ?? 0)} ����Ա</span><code>${escape(n.routes?.find(r => !r.via)?.target ?? 'δ��������')}</code></div><div class="card-footer"><span>${n.v4AssignMode?.zt ? 'IPv4 �Զ�����' : '�ֶ���ַ����'}</span>${button(`�������� ${icon('arrow')}`, 'open', 'link-btn', `data-id="${attr(n.id)}"`)}</div></article>`).join('')}</div>` : empty('��û��ƥ�������', state.networks.length ? '�����������ƻ����� ID��' : '������һ�����磬���豸���κεط�������', state.networks.length ? '' : button(`${icon('plus')} ��������`, 'create', 'primary'));
}
function empty(title, subtitle, action = '') { return `<div class="empty">${icon('network')}<h3>${title}</h3><p>${subtitle}</p>${action}</div>`; }
function overview() {
  return `<div class="page-heading"><div><p class="eyebrow">CONTROL CENTER</p><h1>��������</h1><p class="muted">��������豸������ÿһ�����硣</p></div>${button(`${icon('plus')} ��������`, 'create', 'primary')}</div><section class="hero"><div><div class="hero-kicker"><span class="status-dot"></span> ������磬�����ƿ�</div><h2>�Ѳ�ͬ�ص���豸��<br>�Ž�ͬһ�����硣</h2><p>�Ӽ�ͥʵ���ҵ�Զ�̹����ռ䣬һ�������������ӡ�</p><a href="#networks" data-action="networks">�鿴ȫ������ ${icon('arrow')}</a></div><div class="mesh-art" aria-hidden="true"><svg viewBox="0 0 400 220"><g class="mesh-lines"><path d="M200 111 75 42M200 111l127-69M200 111 60 171M200 111l272-6M200 111l111 74M200 111l-32 89"/></g><circle class="mesh-orbit" cx="200" cy="111" r="74"/><circle class="mesh-orbit" cx="200" cy="111" r="100"/><g class="mesh-nodes"><circle cx="75" cy="42" r="10"/><circle cx="327" cy="42" r="8"/><circle cx="60" cy="171" r="7"/><circle cx="311" cy="185" r="10"/><circle cx="168" cy="200" r="7"/></g><rect class="mesh-center" x="171" y="82" width="58" height="58" rx="17"/><path class="mesh-cube" d="m186 102 14-8 14 8v17l-14 8-14-8Zm0 0 14 9 14-9m-14 9v16"/><g class="mesh-labels"><text x="40" y="22">HOME</text><text x="307" y="22">WORK</text><text x="293" y="217">ANYWHERE</text></g></svg></div></section><div class="stats-grid">${[['network', '��������', state.networks.length, '��������ÿһ������'], ['users', '�ѵǼǳ�Ա', state.networks.reduce((n, x) => n + Number(x.memberCount ?? 0), 0), '��Ա����������������'], ['shield', '˽������', state.networks.filter(n => n.private).length, 'ͨ����Ա��Ȩ���Ʒ���']].map(([symbol, label, count, hint]) => `<div class="stat"><div><span>${label}</span><strong>${count.toString().padStart(2, '0')}</strong><small>${hint}</small></div><div class="stat-icon">${icon(symbol)}</div></div>`).join('')}</div><div class="section-heading"><h2>�ҵ����� <span>${state.networks.length}</span></h2>${searchBox()}</div><div id="network-results">${networkCards()}</div><div class="tip-strip">${icon('shield')}<span>������Ĭ����Ϊ˽�С��豸������ڳ�Ա�б���ȷ�ϲ���Ȩ��</span></div>`;
}
function networksPage() { return `<div class="page-heading"><div><p class="eyebrow">NETWORKS</p><h1>ȫ������</h1><p class="muted">�������硢��Ա���ַ���䡣</p></div>${button(`${icon('plus')} ��������`, 'create', 'primary')}</div><div class="section-heading"><h2>${state.networks.length} ������</h2>${searchBox()}</div><div id="network-results">${networkCards()}</div>`; }
function memberRows() {
  const members = state.members.filter(m => `${m.name} ${m.id} ${(m.ipAssignments ?? []).join(' ')}`.toLowerCase().includes(state.query.toLowerCase())).filter(m => state.filter === 'all' || (state.filter === 'authorized' ? m.authorized : !m.authorized));
  return members.length ? `<div class="table-scroll"><table><thead><tr><th>�豸 / �ڵ� ID</th><th>��Ȩ״̬</th><th>����� IP</th><th>�ͻ��˰汾</th><th class="align-right">����</th></tr></thead><tbody>${members.map(m => `<tr><td><div class="device-cell"><div class="device-icon">${icon(m.activeBridge ? 'network' : 'terminal')}</div><div><strong>${escape(m.name || 'δ�����豸')}</strong><code>${escape(m.id)}</code></div></div></td><td>${badge(m.authorized ? '����Ȩ' : '����Ȩ', m.authorized ? 'green' : 'amber')}</td><td><div class="ip-list">${(m.ipAssignments ?? []).map(ip => `<code>${escape(ip)}</code>`).join('') || '<span class="muted">�ȴ�����</span>'}</div>${m.activeBridge ? '<small class="muted">�����Ž�</small>' : ''}</td><td class="muted">${m.vMajor !== undefined ? escape(`${m.vMajor}.${m.vMinor}.${m.vRev}`) : '��'}</td><td class="align-right"><div class="row-actions">${button(m.authorized ? '������Ȩ' : '��Ȩ', m.authorized ? 'deauthorize' : 'authorize', m.authorized ? 'small subtle' : 'small primary', `data-id="${attr(m.id)}"`)}${button('�༭', 'edit-member', 'small', `data-id="${attr(m.id)}"`)}</div></td></tr>`).join('')}</tbody></table></div>` : empty('û��ƥ��ĳ�Ա', '���豸��������磬��ʹ�á����ӳ�Ա��Ԥ�ȵǼǽڵ㡣');
}
function membersPanel() {
  const pending = state.members.filter(m => !m.authorized).length;
  return `${pending ? `<div class="notice amber"><div>${icon('shield')}<span><strong>${pending} ���豸�ȴ���Ȩ</strong> �� ��˶Խڵ� ID ���������롣</span></div></div>` : ''}<div class="section-heading"><div class="segments" aria-label="ɸѡ��Ա">${[['all', 'ȫ����Ա', state.members.length], ['authorized', '����Ȩ', state.members.length - pending], ['pending', '����Ȩ', pending]].map(([x, label, n]) => `<button class="${state.filter === x ? 'active' : ''}" data-action="filter" data-filter="${x}">${label} <span>${n}</span></button>`).join('')}</div><div class="toolbar">${searchBox('�����豸���ڵ� ID �� IP')}${button(`${icon('plus')} ���ӳ�Ա`, 'add-member', 'small')}</div></div><div class="panel" id="member-results">${memberRows()}</div><p class="table-note">��Ȩ��ʾ�����������磻��������Ա�ӿڲ��ṩ�ɿ���ʵʱ����״̬��</p>`;
}
function field(label, name, value = '', type = 'text', hint = '') { return `<label>${label}<input name="${name}" type="${type}" value="${attr(value)}" ${type === 'number' ? 'step="1"' : 'maxlength="253"'}>${hint ? `<small>${hint}</small>` : ''}</label>`; }
function checkbox(label, name, checked, hint = '') { return `<label class="check-field"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span><strong>${label}</strong>${hint ? `<small>${hint}</small>` : ''}</span></label>`; }
function networkSettings() {
  const n = state.selected;
  return `<form id="settings-form" class="settings-layout"><section class="panel settings-panel"><h2>��������</h2><p class="muted">�޸�������������ʷ�ʽ��</p>${field('��������', 'name', n.name)}<div class="field-grid">${field('MTU', 'mtu', n.mtu ?? 2800, 'number')}${field('�ಥ��������', 'multicastLimit', n.multicastLimit ?? 32, 'number')}</div>${checkbox('˽������', 'private', n.private, 'ֻ������Ȩ��Ա���ܷ���')}${checkbox('�����㲥', 'enableBroadcast', n.enableBroadcast)}<h2 class="subheading">��ַ����</h2>${checkbox('IPv4 �Զ�����', 'v4', n.v4AssignMode?.zt)}${checkbox('IPv6 �Զ�����', 'v6zt', n.v6AssignMode?.zt)}${checkbox('IPv6 RFC 4193', 'rfc4193', n.v6AssignMode?.rfc4193)}${checkbox('IPv6 6plane', 'sixplane', n.v6AssignMode?.['6plane'])}</section><section class="panel settings-panel"><h2>DNS</h2><p class="muted">�ͻ�����Ҫ���� allowDNS �Ż�Ӧ�����á�</p>${field('��������', 'domain', n.dns?.domain ?? '', 'text', '���ձ�ʾ������������')}${field('DNS ������', 'servers', (n.dns?.servers ?? []).join(', '), 'text', '��� IPv4 / IPv6 ��ַ�ö��ŷָ�')}<div class="form-footer">${button('��������', 'submit-settings', 'primary', 'type="submit"')}</div><div class="danger-zone"><h3>ɾ������</h3><p>�������Ա���ý���ɾ�������г�Ա��ʧȥ������ķ���Ȩ�ޡ�</p>${button('ɾ��������', 'delete-network', 'danger')}</div></section></form>`;
}
function routesPanel() {
  const n = state.selected;
  return `<div class="settings-layout"><section class="panel settings-panel"><div class="section-heading"><div><h2>�й�·��</h2><p class="muted">��Ŀ���������͸������Ա��</p></div>${button(`${icon('plus')} ����`, 'add-route', 'small')}</div>${n.routes?.length ? `<table><thead><tr><th>Ŀ������</th><th>����</th><th></th></tr></thead><tbody>${n.routes.map((r, i) => `<tr><td><code>${escape(r.target)}</code></td><td><code>${escape(r.via ?? 'ֱ��')}</code></td><td>${button('ɾ��', 'remove-route', 'small subtle', `data-index="${i}"`)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">����·��</p>'}<p class="table-note">Ĭ��·�ɻ����ڿͻ������� allowDefault��</p></section><section class="panel settings-panel"><div class="section-heading"><div><h2>�Զ������ַ��</h2><p class="muted">��Ա IP Ӧ���ڶ�Ӧ��ֱ��·���С�</p></div>${button(`${icon('plus')} ����`, 'add-pool', 'small')}</div>${n.ipAssignmentPools?.length ? `<table><thead><tr><th>��ʼ IP</th><th>���� IP</th><th></th></tr></thead><tbody>${n.ipAssignmentPools.map((p, i) => `<tr><td><code>${escape(p.ipRangeStart)}</code></td><td><code>${escape(p.ipRangeEnd)}</code></td><td>${button('ɾ��', 'remove-pool', 'small subtle', `data-index="${i}"`)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">���޵�ַ��</p>'}</section></div>`;
}
function details() {
  const n = state.selected;
  if (!n) return empty('���ڼ�������', '�Ժ󼴿ɹ�����Ա���������á�');
  return `<button class="back-link" data-action="networks">�� ���������б�</button><div class="page-heading"><div><div class="heading-line"><h1>${escape(n.name || 'δ��������')}</h1>${badge(n.private ? '˽������' : '��������', 'neutral')}</div><div class="network-id"><code>${escape(n.id)}</code>${button(icon('copy'), 'copy', 'icon-btn', `data-value="${attr(n.id)}" aria-label="�������� ID"`)}</div></div><div class="toolbar">${button(`${icon('terminal')} ����ָ��`, 'join', '')}${button(`${icon('download')} ��������`, 'export', '')}</div></div><div class="tabs" role="tablist">${[['members', '��Ա����', state.members.length], ['routes', '·�����ַ��'], ['settings', '��������']].map(([tab, label, count]) => `<button role="tab" aria-selected="${state.tab === tab}" class="${state.tab === tab ? 'active' : ''}" data-action="tab" data-tab="${tab}">${label}${count === undefined ? '' : `<span>${count}</span>`}</button>`).join('')}</div><div role="tabpanel">${state.tab === 'members' ? membersPanel() : state.tab === 'routes' ? routesPanel() : networkSettings()}</div>`;
}
function peersPage() { return `<div class="page-heading"><div><p class="eyebrow">CONNECTIONS</p><h1>�ڵ�����</h1><p class="muted">��ǰ���������ھӽڵ�����ڵ�·����</p></div></div><div class="panel table-scroll"><table><thead><tr><th>�ڵ� ID</th><th>��ɫ</th><th>�ӳ�</th><th>�·��</th></tr></thead><tbody>${state.peers.map(p => `<tr><td><code>${escape(p.address)}</code></td><td>${badge(p.role, p.role === 'PLANET' ? 'blue' : 'neutral')}</td><td>${p.latency >= 0 ? `${Number(p.latency)} ms` : 'δ֪'}</td><td>${(p.paths ?? []).filter(x => x.active).map(x => `<div class="path"><code>${escape(x.address)}</code>${x.preferred ? badge('����·��', 'green') : ''}</div>`).join('') || '<span class="muted">���޻·��</span>'}</td></tr>`).join('')}</tbody></table>${state.peers.length ? '' : empty('���޽ڵ�����', '�豸��ʼͨ�ź��ھӽڵ����������')}</div><p class="table-note">����չʾ���������������ӣ����ܴ������пͻ��˵�������ϡ�</p>`; }
const actions = { login: '����Ա��¼', 'account.update': '�޸Ĺ����˺�', 'network.create': '��������', 'network.update': '��������', 'network.delete': 'ɾ������', 'member.update': '���³�Ա', 'member.authorize': '��Ȩ��Ա', 'member.deauthorize': '������Ա��Ȩ', 'member.delete': 'ɾ����Ա' };
function auditPage() { return `<div class="page-heading"><div><p class="eyebrow">ACTIVITY</p><h1>������¼</h1><p class="muted">��ǰ��������������������� 200 ���ɹ�������</p></div></div><div class="panel table-scroll"><table><thead><tr><th>ʱ��</th><th>����</th><th>Ŀ��</th></tr></thead><tbody>${state.audit.map(a => `<tr><td class="muted">${formatTime(a.time)}</td><td>${escape(actions[a.action] ?? a.action)}</td><td><code>${escape(a.target)}</code></td></tr>`).join('')}</tbody></table>${state.audit.length ? '' : empty('��û�в�����¼', 'ͨ�������ɵ��޸Ļ���ʾ�����')}</div><p class="table-note">����ģʽͬʱ������ת��־������������Ŀ¼����������ֱ���޸Ŀ������Ĳ������ڴ˼�¼��</p>`; }
function about() { const s = state.status; return `<div class="page-heading"><div><p class="eyebrow">CONTROLLER</p><h1>��������Ϣ</h1><p class="muted">���������� ZeroTier �������ĵ�ǰ״̬��</p></div></div><div class="panel settings-panel info-panel"><h2>����״̬</h2><dl><dt>�������ڵ� ID</dt><dd><code>${escape(s?.address ?? '��')}</code></dd><dt>ZeroTier �汾</dt><dd>${escape(s?.version ?? '��')}</dd><dt>ZeroTier ��������</dt><dd>${s?.online ? badge('������', 'green') : badge('δ����', 'amber')}</dd><dt>TCP ����</dt><dd>${s?.tcpFallbackActive ? '������' : 'δ����'}</dd><dt>����ģʽ</dt><dd>${state.session.demo ? '��ʾģʽ���ڴ��е�ģ�����ݣ�' : 'ʵ�ʿ�����'}</dd><dt>�־û������־</dt><dd>${state.session.demo ? '��ʾģʽ��д����' : s?.auditHealthy ? 'д������' : 'д��ʧ��'}</dd><dt>�������汾</dt><dd>0.4.0</dd></dl><p class="muted">�����������Ա���ݱ����� ZeroTier �������С��������ݻ��豣��������� identity.secret �� controller.d���������õ�����������������ݡ�</p><a href="https://github.com/SuzukiR1n/zerotier-control" target="_blank" rel="noopener noreferrer">GitHub ��Ŀ �J</a></div>`; }
function planetPage() {
  const p = state.planet;
  const instructions = `<section class="panel settings-panel"><h2>�ÿͻ���������� Planet</h2><ol class="client-steps"><li>���� planet �ļ��������ԭ�ļ���</li><li>ֹͣ�ͻ��˵� ZeroTier ���񣬽��ļ��ŵ��·�Ŀ¼����������</li><li>�ڿͻ��˼�����ҳ���������� ID���ص���Ա�б������Ȩ��</li><li>�鿴�ͻ��� peers��ȷ�ϸ��ڵ��ɫΪ PLANET����ַΪ�Լ��ķ�������</li></ol><dl class="client-paths"><dt>Windows</dt><dd><code>C:\\ProgramData\\ZeroTier\\One\\planet</code></dd><dt>Linux</dt><dd><code>/var/lib/zerotier-one/planet</code></dd><dt>macOS</dt><dd><code>/Library/Application Support/ZeroTier/One/planet</code></dd></dl><p class="table-note">��Ҫ����ԱȨ�ޡ��ٷ� Android / iOS �ͻ��˲��ṩ�����Խ� Planet �Ľ��棻��ʹ��֧�ָù��ܵĿͻ��ˡ�</p></section>`;
  return `<div class="page-heading"><div><p class="eyebrow">YOUR PLANET</p><h1>Planet ��ͻ���</h1><p class="muted">���ڵ������ļ���ͻ��˽���ָ����</p></div>${p?.available ? '<a class="btn primary" href="/api/planet/download">' + icon('download') + ' ���� planet</a>' : ''}</div><div class="settings-layout"><section class="panel settings-panel info-panel"><h2>��ǰ Planet</h2>${p?.available ? `<dl><dt>ZeroTier �汾</dt><dd>${escape(p.zerotierVersion)}</dd><dt>���ڵ�����</dt><dd>${p.roots.length}</dd><dt>����ʱ��</dt><dd>${formatTime(p.timestamp)}</dd><dt>�ļ���С</dt><dd>${p.size} bytes</dd></dl>${p.roots.map(r => `<h3 class="subheading">���ڵ� <code>${escape(r.identity.split(':')[0])}</code></h3>${r.stableEndpoints.map(e => `<div class="path"><code>${escape(e)}</code></div>`).join('')}`).join('')}<h3 class="subheading">SHA-256</h3><code class="checksum">${escape(p.sha256)}</code><p class="muted">���ؽ������ͻ��������ļ����������ڵ�˽Կ�� Planet ǩ����Կ��</p>` : `<p class="muted">${state.session.demo ? '��ʾģʽʹ��ģ�����磬�����ɻ����� Planet �ļ���ʵ�ʲ���󣬴˴�����ʾ��ĸ��ڵ���������ڡ�' : '��ǰ��������δ���� Planet �ļ�Ŀ¼��'}</p>`}</section>${instructions}</div>`;
}
function render() {
  if ((!state.session?.authenticated || state.session.mustChangeCredentials) && modal.open) modal.close();
  if (!state.session?.authenticated) return login();
  if (state.session.mustChangeCredentials) return login();
  const names = { overview: '��������', networks: 'ȫ������', detail: '��������', peers: '�ڵ�����', planet: 'Planet ��ͻ���', audit: '������¼', about: '��������Ϣ', account: '�˺�����' };
  root.innerHTML = `${sidebar()}<div class="main-shell"><header class="topbar"><div class="breadcrumbs">�����ռ� <span>/</span> <strong>${names[state.view]}</strong></div><div class="topbar-actions">${state.session.demo ? badge('��ʾģʽ', 'blue') : ''}<span class="refresh-time">${state.refreshed ? '������ ' + new Date(state.refreshed).toLocaleTimeString('zh-CN', { hour12: false }) : ''}</span>${button(icon('refresh'), 'refresh', 'icon-btn', 'aria-label="ˢ������" title="ˢ������"')}<div class="avatar" title="${attr(state.session.user)}" aria-label="��ǰ�û� ${attr(state.session.user)}">${escape(state.session.user.slice(0, 1).toUpperCase())}</div></div></header>${state.session.demo ? '<div class="demo-bar">��ǰΪ������ʾ��ʹ��ģ�����ݡ��޸�ֻӰ��˴���ʾ���������������á�</div>' : ''}<main class="content" aria-busy="${state.busy}">${errorBanner()}${state.view === 'overview' ? overview() : state.view === 'networks' ? networksPage() : state.view === 'detail' ? details() : state.view === 'peers' ? peersPage() : state.view === 'audit' ? auditPage() : state.view === 'planet' ? planetPage() : state.view === 'account' ? accountPage() : about()}</main><footer class="page-footer"><span>ZeroTier Control</span><span>���ӣ��������ա�</span></footer></div>`;
}
async function refresh() {
  if (!state.session?.authenticated || state.session.mustChangeCredentials) return;
  if (state.busy) return; state.busy = true;
  try {
    const [status, networks] = await Promise.all([api('/status'), api('/networks')]); state.status = status; state.networks = networks;
    if (state.view === 'detail' && state.selected) { const [n, members] = await Promise.all([api(`/networks/${state.selected.id}`), api(`/networks/${state.selected.id}/members`)]); state.selected = n; state.members = members; }
    if (state.view === 'peers') state.peers = await api('/peers');
    if (state.view === 'planet') state.planet = await api('/planet');
    if (state.view === 'audit') state.audit = await api('/audit');
    state.error = ''; state.refreshed = Date.now();
  } catch (e) { state.error = e.message; state.status = null; }
  finally { state.busy = false; render(); }
}
async function openNetwork(id) {
  const [n, members] = await Promise.all([api(`/networks/${id}`), api(`/networks/${id}/members`)]);
  state.selected = n; state.members = members; state.view = 'detail'; state.tab = 'members'; state.query = ''; state.filter = 'all'; render();
}
function showModal(title, fields, onSubmit, label = '����', danger = false) {
  modal.innerHTML = `<form id="modal-form"><div class="modal-heading"><h2 id="modal-title">${escape(title)}</h2>${button(icon('close'), 'close', 'icon-btn', 'type="button" aria-label="�رնԻ���"')}</div><div class="modal-body">${fields}<p id="modal-error" class="form-error" role="alert"></p></div><div class="modal-footer">${button('ȡ��', 'close', '', 'type="button"')}<button type="submit" class="btn ${danger ? 'danger solid' : 'primary'}">${label}</button></div></form>`;
  modal.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault(); const b = e.submitter; b.disabled = true;
    try { await onSubmit(new FormData(e.target)); modal.close(); await refresh(); }
    catch (error) { modal.querySelector('#modal-error').textContent = error.message; }
    finally { b.disabled = false; }
  });
  modal.showModal();
}
async function patchNetwork(patch) { state.selected = await api(`/networks/${state.selected.id}`, 'PATCH', patch); toast('���������ѱ���'); }
function confirmAction(title, message, onSubmit, expected) {
  showModal(title, `<p>${message}</p>${expected ? field('���� ID ȷ��', 'confirm', '', 'text', escape(expected)) : ''}`, async data => { await onSubmit(data); toast('���������'); }, 'ȷ��', true);
}
async function doAction(action, el) {
  const id = el.dataset.id, n = state.selected;
  if (['overview', 'networks', 'peers', 'planet', 'audit', 'about', 'account'].includes(action)) { state.view = action; state.query = ''; render(); await refresh(); }
  else if (action === 'refresh') await refresh();
  else if (action === 'theme') { const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme; try { localStorage.setItem('ztc-theme', theme); } catch { /* Storage may be disabled. */ } render(); }
  else if (action === 'logout') { await api('/logout', 'POST', {}); state.session = { authenticated: false }; render(); }
  else if (action === 'copy') { await navigator.clipboard.writeText(el.dataset.value); toast('�Ѹ���'); }
  else if (action === 'open') await openNetwork(id);
  else if (action === 'tab') { state.tab = el.dataset.tab; state.query = ''; render(); }
  else if (action === 'filter') { state.filter = el.dataset.filter; render(); }
  else if (action === 'close') modal.close();
  else if (action === 'create') showModal('����һ��������', `<p class="muted">ѡ�����ƺ� IPv4 ���������Զ�����ֱ��·�����ַ�ء�</p>${field('��������', 'name', '', 'text')}${field('IPv4 ����', 'cidr', '10.10.0.0/24', 'text', '������뱾�ؾ����������������ص�')}<div class="notice">${icon('shield')} ������Ĭ��˽�У���Ա�������Ҫ��Ȩ��</div>`, async d => { const created = await api('/networks', 'POST', Object.fromEntries(d)); await openNetwork(created.id); toast('�����Ѵ���'); }, '��������');
  else if (action === 'authorize') { await api(`/networks/${n.id}/members/${id}`, 'PATCH', { authorized: true }); toast('��Ա����Ȩ'); await refresh(); }
  else if (action === 'deauthorize') confirmAction('������Ա��Ȩ', `�ڵ� <code>${escape(id)}</code> ��ʧȥ������ķ���Ȩ�ޡ�`, () => api(`/networks/${n.id}/members/${id}`, 'PATCH', { authorized: false }));
  else if (action === 'add-member' || action === 'edit-member') {
    const m = state.members.find(x => x.id === id) ?? {};
    showModal(action === 'add-member' ? '���ӳ�Ա' : '�༭��Ա', `${action === 'add-member' ? field('�ڵ� ID��10 λʮ�����ƣ�', 'id') : `<p class="muted">�ڵ� <code>${escape(id)}</code></p>`}${field('�豸����', 'name', m.name ?? '')}${field('�̶� IP ��ַ', 'ips', (m.ipAssignments ?? []).join(', '), 'text', '�����ַ�ö��ŷָ������ս����Զ����䣻��д IP��������������')}${checkbox('������������', 'authorized', m.authorized)}${checkbox('������̫���Ž�', 'activeBridge', m.activeBridge)}${checkbox('�رմ˳�Ա���Զ� IP ����', 'noAutoAssignIps', m.noAutoAssignIps)}${id ? button('ɾ����Ա��', 'delete-member', 'danger small', `type="button" data-id="${attr(id)}"`) : ''}`, async d => {
      const mid = id ?? String(d.get('id')).trim().toLowerCase(); if (!/^[0-9a-f]{10}$/.test(mid)) throw new Error('�ڵ� ID ����Ϊ 10 λʮ������');
      await api(`/networks/${n.id}/members/${mid}`, 'PATCH', { name: d.get('name'), ipAssignments: String(d.get('ips')).split(',').map(x => x.trim()).filter(Boolean), authorized: d.has('authorized'), activeBridge: d.has('activeBridge'), noAutoAssignIps: d.has('noAutoAssignIps') }); toast('��Ա�����ѱ���');
    });
  } else if (action === 'delete-member') { modal.close(); confirmAction('ɾ����Ա', '���ȳ�����Ȩ����ɾ����Ա��¼�����ڳ��Լ���������豸�������³��֡�', d => api(`/networks/${n.id}/members/${id}`, 'DELETE', { confirm: d.get('confirm') }), id); }
  else if (action === 'delete-network') confirmAction('ɾ������', '�˲�����ɾ�������ȫ����Ա���á����ȵ��������ݿ��������ݡ�', async d => { await api(`/networks/${n.id}`, 'DELETE', { confirm: d.get('confirm') }); state.view = 'networks'; state.selected = null; }, n.id);
  else if (action === 'add-route') showModal('�����й�·��', `${field('Ŀ��������CIDR��', 'target', '10.20.0.0/24')}${field('���� IP', 'via', '', 'text', 'ֱ��·�����ա�Ĭ��·����Ҫ�ͻ������� allowDefault��')}`, d => patchNetwork({ routes: [...(n.routes ?? []), { target: d.get('target').trim(), via: d.get('via').trim() || null }] }));
  else if (action === 'add-pool') showModal('���ӵ�ַ��', `${field('��ʼ IP', 'ipRangeStart', '10.10.0.10')}${field('���� IP', 'ipRangeEnd', '10.10.0.250')}<p class="muted">��Ҫ�ڶ�Ӧ����������ֱ��·�ɲ������Զ����䡣</p>`, d => patchNetwork({ ipAssignmentPools: [...(n.ipAssignmentPools ?? []), Object.fromEntries(d)] }));
  else if (action === 'remove-route' || action === 'remove-pool') { const key = action === 'remove-route' ? 'routes' : 'ipAssignmentPools'; confirmAction('ɾ��������', '����Ӱ���Ա��·�ɻ��ַ���䡣', () => patchNetwork({ [key]: n[key].filter((_, i) => i !== Number(el.dataset.index)) })); }
  else if (action === 'join') showModal('���豸��������', `<p>�ȴӡ�Planet ��ͻ��ˡ����ز���װ planet �ļ��������ͻ��˷������������������ ID�����ص���Ա�б������Ȩ��</p><div class="copy-block"><code>${escape(n.id)}</code>${button(icon('copy'), 'copy', 'icon-btn', `type="button" data-value="${attr(n.id)}" aria-label="�������� ID"`)}</div><p class="muted">Ҳ�����ڰ�װ�� ZeroTier �Ŀͻ���ִ�У�</p><div class="copy-block"><code>zerotier-cli join ${escape(n.id)}</code>${button(icon('copy'), 'copy', 'icon-btn', `type="button" data-value="zerotier-cli join ${attr(n.id)}" aria-label="���Ƽ�������"`)}</div>`, async () => {}, '���');
  else if (action === 'export') {
    const data = await api(`/networks/${n.id}/export`); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `network-${n.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('�����ѵ������������ݻ��豣����������ݣ�');
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
      render(); toast('�û����������ѱ���'); await refresh();
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
try { state.session = await api('/session'); render(); if (state.session.authenticated) await refresh(); } catch (e) { root.innerHTML = `<div class="empty"><h1>�޷����ӹ�������</h1><p>${escape(e.message)}</p><a href="/">���¼���</a></div>`; }
