process.env.NODE_ENV = 'test';
process.env.DISABLE_QUEUES = '1';
process.env.DISABLE_REDIS_IDEMPOTENCY = '1';
process.env.JWT_SECRET = '';

if (!process.env.TEST_DATABASE_URL) {
  const user = process.env.PGUSER || process.env.USER || 'postgres';
  process.env.TEST_DATABASE_URL = `postgres://${user}@localhost:5432/gridwatch_test`;
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
