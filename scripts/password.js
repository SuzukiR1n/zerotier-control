import { mkdir, writeFile } from 'node:fs/promises';
import { passwordHash } from '../server/account.js';

if (process.argv.includes('--hash')) {
  if (process.stdin.isTTY) throw new Error('��ӱ�׼���봫�����룬��Ҫ������������������');
  let password = '';
  for await (const chunk of process.stdin) { password += chunk; if (password.length > 512) throw new Error('�������'); }
  password = password.trim();
  if (password.length < 12 || password.length > 256) throw new Error('������Ҫ 12�C256 ���ַ�');
  console.log(await passwordHash(password));
} else {
  await mkdir('secrets', { recursive: true, mode: 0o700 });
  await writeFile('secrets/admin-password', (await passwordHash('admin')) + '\n', { flag: 'wx', mode: 0o600 });
  console.log('��ʼ�˺� admin / admin ��׼�����״ε�¼�����޸��û��������룬���ļ������ύ�� Git��');
}
