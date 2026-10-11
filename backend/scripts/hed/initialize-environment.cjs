const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { guardEnvironment } = require('./guard-environment.cjs');
const root = path.resolve(__dirname, '../../..');
const file = path.join(root, '.local/hed/backend.env');
if (fs.existsSync(file)) {
  guardEnvironment(require('dotenv').parse(fs.readFileSync(file)));
  console.log('HED existing environment verified; credentials retained');
} else {
  const password = randomBytes(24).toString('hex');
  const contents = fs.readFileSync(path.join(root, 'backend/environments/hed/.env.example'), 'utf8')
    .replace('LOCAL_HED_PASSWORD', password).replace('LOCAL_HED_ACCESS_KEY', `hed-${randomBytes(8).toString('hex')}`)
    .replace('LOCAL_HED_STORAGE_PASSWORD', randomBytes(24).toString('hex')) + `\nHED_DATABASE_PASSWORD=${password}\n`;
  guardEnvironment(require('dotenv').parse(contents));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, { flag: 'wx' });
  console.log('HED ignored environment created with isolated local credentials');
}
