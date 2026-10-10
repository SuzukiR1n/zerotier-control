// Called by the deployment script with the Web stopped and its data volume mounted.
import { resetAccount } from '../server/account.js';
await resetAccount(process.env.DATA_DIR);
console.log('管理账号已重置，下一次登录必须修改用户名和密码。');
