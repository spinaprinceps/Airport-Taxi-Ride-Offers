// Test-only helpers. Tests run against taxi_test (see vitest.config.js).
import { pool, applySchema } from '../../src/db.js';
import { loadData } from '../../src/loader.js';

if (!/taxi_test/.test(process.env.DATABASE_URL ?? '')) {
  throw new Error('Refusing to reset a database that is not taxi_test');
}

// Fresh database: drop everything, then boot exactly like server.js does.
export async function resetDatabase() {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await applySchema();
  await loadData();
}

export async function count(table) {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
  return rows[0].n;
}

export { pool };
