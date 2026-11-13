import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { DATABASE_URL } from './config.js';

// timestamp (no zone, type id 1114): return "2027-04-10T11:30" as is, never a Date.
pg.types.setTypeParser(1114, (s) => s.slice(0, 16).replace(' ', 'T'));
// bigint / bigserial (20): ids fit in a JS number.
pg.types.setTypeParser(20, (s) => Number(s));
// numeric (1700): ratings, distances.
pg.types.setTypeParser(1700, (s) => Number(s));

export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });

export function query(text, params) {
  return pool.query(text, params);
}

// Runs schema.sql (every statement is IF NOT EXISTS), at every boot before the loader.
export async function applySchema() {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
}

// Runs fn(client) inside BEGIN/COMMIT; rolls back on any throw.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
