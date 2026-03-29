import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Define singleton pool configuration
const connectionString =
  process.env.DATABASE_URL || 'postgres://gridwatch_user:gridwatch_password@localhost:5432/gridwatch';

export const pool = new Pool({
  connectionString,
  // Recommended production pool tuning based on requirements
  max: 20, // Max clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Attach a standard error listener to the pool to prevent Node from crashing
// unexpectedly if idle clients experience issues.
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle database client', err);
  process.exit(-1);
});

/**
 * A handy wrapper for generic queries
 */
export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};

export interface ScopedUser {
  id: string;
  role: 'operator' | 'supervisor';
  zone_id?: string;
}

/**
 * Runs a query within a database transaction context scoped to a user's zone.
 */
export const scopedQuery = async (user: ScopedUser, text: string, params?: any[]) => {
  const client = await pool.connect();
  try {
    // Setting transaction isolation context using local set
    await client.query('BEGIN');
    // Use set_config: PostgreSQL does not accept bind parameters in SET LOCAL via the extended
    // query protocol (node-pg), which caused scoped queries to fail with a syntax error.
    await client.query(`SELECT set_config('request.role', $1, true)`, [user.role]);
    if (user.zone_id) {
      await client.query(`SELECT set_config('request.zone_id', $1, true)`, [user.zone_id]);
    }
    
    // Execute query within context
    const res = await client.query(text, params);
    
    await client.query('COMMIT');
    return res;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Executes a callback within an explicit database transaction context.
 * Perfect for atomic multi-inserts.
 */
export const withTransaction = async <T>(
  callback: (client: any) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
