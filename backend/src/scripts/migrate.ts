import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

async function run() {
  const connectionString =
    process.env.DATABASE_URL || 'postgres://gridwatch_user:gridwatch_password@localhost:5432/gridwatch';
  const migrationsDir = path.resolve(__dirname, '../../migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const client = new Client({ connectionString });
  await client.connect();
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
      console.log(`applied migration: ${file}`);
    }
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('migration failure', err);
  process.exit(1);
});
