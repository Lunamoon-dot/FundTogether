const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { guardEnvironment } = require('./guard-environment.cjs');
const root = path.resolve(__dirname, '../../..');
const file = path.join(root, '.local/workflow-b/backend.env');
if (fs.existsSync(file)) {
  guardEnvironment(require('dotenv').parse(fs.readFileSync(file)));
  console.log('Workflow B existing environment verified; credentials retained');
} else {
  const password = randomBytes(24).toString('hex');
  const contents = fs.readFileSync(path.join(root, 'backend/environments/workflow-b/.env.example'), 'utf8')
    .replace('LOCAL_B_PASSWORD', password).replace('LOCAL_B_ACCESS_KEY', `workflow-b-${randomBytes(8).toString('hex')}`)
    .replace('LOCAL_B_STORAGE_PASSWORD', randomBytes(24).toString('hex')) + `\nWORKFLOW_B_DATABASE_PASSWORD=${password}\n`;
  guardEnvironment(require('dotenv').parse(contents));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, { flag: 'wx' });
  console.log('Workflow B ignored environment created with isolated local credentials');
}
