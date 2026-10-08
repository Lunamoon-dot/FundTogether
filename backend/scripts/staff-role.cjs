// Local operator provisioning: never grants on-chain authority or creates accounts.
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
async function main() {
  const [email, ...roles] = process.argv.slice(2);
  if (!email || roles.some(role => !['ADMIN', 'RESOLVER'].includes(role))) throw new Error('Usage: node scripts/staff-role.cjs EMAIL [ADMIN] [RESOLVER]. No roles revokes staff access.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(`INSERT INTO platform_roles (user_id, roles, updated_at)
      SELECT id, $2::jsonb, now() FROM users WHERE email = $1
      ON CONFLICT (user_id) DO UPDATE SET roles = EXCLUDED.roles, updated_at = now() RETURNING user_id, roles`,
      [email.trim().toLowerCase(), JSON.stringify([...new Set(roles)])]);
    if (!result.rowCount) throw new Error('Existing account not found; register the requested email first.');
    console.log(JSON.stringify({ email: email.trim().toLowerCase(), roles: result.rows[0].roles }));
  } finally { await pool.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
