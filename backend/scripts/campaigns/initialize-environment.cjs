const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { guardEnvironment } = require('./guard-environment.cjs');

const root = path.resolve(__dirname, '../../..');
const file = path.join(root, '.local/fundtogether/backend.env');
if (fs.existsSync(file)) {
  guardEnvironment(require('dotenv').parse(fs.readFileSync(file)));
  console.log('Campaign existing environment verified; credentials retained');
} else {
  const password = randomBytes(24).toString('hex');
  const contents = fs.readFileSync(path.join(root, 'backend/environments/fundtogether/.env.example'), 'utf8')
    .replace('LOCAL_CAMPAIGNS_PASSWORD', password)
    .replace('LOCAL_CAMPAIGNS_ACCESS_KEY', `campaign-${randomBytes(8).toString('hex')}`)
    .replace('LOCAL_CAMPAIGNS_STORAGE_PASSWORD', randomBytes(24).toString('hex'))
    + `\nFUNDTOGETHER_DATABASE_PASSWORD=${password}\n`;
  guardEnvironment(require('dotenv').parse(contents));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, { flag: 'wx' });
  console.log('Campaign ignored environment created with isolated local credentials');
}
