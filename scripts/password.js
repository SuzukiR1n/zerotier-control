import { mkdir, writeFile } from 'node:fs/promises';
import { passwordHash } from '../server/account.js';

if (process.argv.includes('--hash')) {
  if (process.stdin.isTTY) throw new Error('请从标准输入传入密码，不要将密码放在命令参数中');
  let password = '';
  for await (const chunk of process.stdin) { password += chunk; if (password.length > 512) throw new Error('输入过长'); }
  password = password.trim();
  if (password.length < 12 || password.length > 256) throw new Error('密码需要 12–256 个字符');
  console.log(await passwordHash(password));
} else {
  await mkdir('secrets', { recursive: true, mode: 0o700 });
  await writeFile('secrets/admin-password', (await passwordHash('admin')) + '\n', { flag: 'wx', mode: 0o600 });
  console.log('初始账号 admin / admin 已准备。首次登录必须修改用户名和密码，该文件不会提交到 Git。');
}
