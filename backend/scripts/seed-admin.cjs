const argon2 = require('argon2');
const { Client } = require('pg');

async function seedAdmin() {
  const db = new Client({
    connectionString: 'postgresql://postgres:178ce44a96c1d2be16a04cee80e51602129a596742b23731@localhost:5436/fundtogether_reward',
  });
  await db.connect();
  try {
    const passwordHash = await argon2.hash('AdminPassword123!', {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    let userRes = await db.query('SELECT id FROM users WHERE email = $1', ['admin@fundtogether.com']);
    let userId;
    if (userRes.rows.length === 0) {
      const inserted = await db.query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
        ['admin@fundtogether.com', passwordHash]
      );
      userId = inserted.rows[0].id;
      console.log('Created admin user id:', userId);
    } else {
      userId = userRes.rows[0].id;
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
      console.log('Updated existing admin user id:', userId);
    }

    await db.query(
      `INSERT INTO platform_roles (user_id, roles) VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET roles = $2::jsonb, updated_at = now()`,
      [userId, JSON.stringify(['ADMIN', 'RESOLVER'])]
    );

    await db.query(
      `INSERT INTO wallet_links (user_id, chain_id, address)
       VALUES ($1, $2, $3)
       ON CONFLICT (chain_id, address) DO UPDATE SET user_id = $1`,
      [userId, '31339', '0x70997970c51812dc3a010c7d01b50e0d17dc79c8']
    );
    console.log('Linked resolver wallet 0x70997970c51812dc3a010c7d01b50e0d17dc79c8 to admin account');

    const check = await db.query(
      'SELECT u.email, pr.roles FROM users u JOIN platform_roles pr ON u.id = pr.user_id WHERE u.id = $1',
      [userId]
    );
    console.log('Admin account created successfully:', check.rows[0]);
  } finally {
    await db.end();
  }
}

seedAdmin().catch(err => {
  console.error(err);
  process.exit(1);
});
