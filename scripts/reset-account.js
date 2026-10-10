// Called by the deployment script with the Web stopped and its data volume mounted.
import { resetAccount } from '../server/account.js';
await resetAccount(process.env.DATA_DIR);
console.log('�����˺������ã���һ�ε�¼�����޸��û��������롣');
