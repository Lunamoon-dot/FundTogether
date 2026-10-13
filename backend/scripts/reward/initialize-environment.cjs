const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { guardEnvironment } = require('./guard-environment.cjs');

const root = path.resolve(__dirname, '../../..');
const file = path.join(root, '.local/reward/backend.env');
if (fs.existsSync(file)) {
  guardEnvironment(require('dotenv').parse(fs.readFileSync(file)));
  console.log('Reward existing environment verified; credentials retained');
} else {
  const password = randomBytes(24).toString('hex');
  const contents = fs.readFileSync(path.join(root, 'backend/environments/reward/.env.example'), 'utf8')
    .replace('LOCAL_REWARD_PASSWORD', password)
    .replace('LOCAL_REWARD_ACCESS_KEY', `reward-${randomBytes(8).toString('hex')}`)
    .replace('LOCAL_REWARD_STORAGE_PASSWORD', randomBytes(24).toString('hex'))
    .replace('LOCAL_REWARD_PII_ENCRYPTION_KEY', randomBytes(32).toString('hex'))
    + `\nREWARD_DATABASE_PASSWORD=${password}\n`;
  guardEnvironment(require('dotenv').parse(contents));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, { flag: 'wx' });
  console.log('Reward ignored environment created with isolated local credentials');
}
