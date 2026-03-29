import fs from 'fs';
import path from 'path';
import { pool, query } from '../../src/db';

const TRUNCATE_TABLES = [
  'alert_audit_log',
  'escalations',
  'alerts',
  'anomalies',
  'suppressions',
  'rules',
  'readings',
  'sensors',
  'user_zone_access',
  'users',
  'zones',
];

function assertSafeTestDatabase() {
  const url = process.env.DATABASE_URL || '';
  const dbName = url.split('/').pop() || '';
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to run tests against non-test database: ${dbName}`);
  }
}

async function rebuildSchema() {
  const initSqlPath = path.resolve(__dirname, '../../../init.sql');
  const migrationsDir = path.resolve(__dirname, '../../migrations');
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await query(fs.readFileSync(initSqlPath, 'utf8'));
  for (const file of migrationFiles) {
    await query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
}

beforeAll(async () => {
  assertSafeTestDatabase();
  await rebuildSchema();
});

beforeEach(async () => {
  await query(`TRUNCATE ${TRUNCATE_TABLES.join(', ')} CASCADE`);
});

afterAll(async () => {
  await pool.end();
});
