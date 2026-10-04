const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '../.env');
const original = fs.readFileSync(envPath, 'utf8');
const existing = dotenv.parse(original);
const settings = {
  S3_ENDPOINT: 'http://127.0.0.1:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'fundtogether-evidence-private',
  S3_ACCESS_KEY_ID: `ftlocal${crypto.randomBytes(8).toString('hex')}`,
  S3_SECRET_ACCESS_KEY: crypto.randomBytes(32).toString('hex'),
};
const missing = Object.entries(settings).filter(([key]) => !existing[key]);
if (missing.length) fs.appendFileSync(envPath, '\n' + missing.map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
console.log('Local storage settings available in backend/.env; credentials were not printed.');
