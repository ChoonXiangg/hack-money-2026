import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log('New Development Wallet');
console.log('----------------------');
console.log('Address:', account.address);
console.log('Private Key:', privateKey);
console.log('\n⚠️  Save this private key securely and add to .env');