import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@libsql/client';
import path from 'node:path';

const url = process.env.TURSO_DATABASE_URL || process.env.TURSO_DB_URL;
if (!url || !/^libsql:|^https?:/.test(url)) throw new Error('Set TURSO_DATABASE_URL or TURSO_DB_URL before migrating.');
const authToken = process.env.TURSO_AUTH_TOKEN || process.env.TURSO_TOKEN;
if (!authToken) throw new Error('TURSO_AUTH_TOKEN or TURSO_TOKEN is required for the one-time import.');

// Importing the server module initializes the target schema and creates only the known preview seed rows.
await import('../server/index.js');
const target = createClient({ url, authToken });
const source = new DatabaseSync(path.resolve('server/bapd.sqlite'), { readOnly: true });

const protectedCounts = await Promise.all([
  'SELECT COUNT(*) AS n FROM players WHERE is_demo=0',
  'SELECT COUNT(*) AS n FROM tournaments WHERE is_demo=0',
  'SELECT COUNT(*) AS n FROM registrations WHERE is_demo=0',
  "SELECT COUNT(*) AS n FROM news WHERE is_demo=0 AND title<>'Palghar at the national championships'",
  'SELECT COUNT(*) AS n FROM contact_messages',
  'SELECT COUNT(*) AS n FROM player_accounts',
].map(async sql => (await target.execute(sql)).rows[0]?.n || 0));
const hasLiveData = protectedCounts.some(value => Number(value) > 0);
if (hasLiveData) throw new Error('The Turso database already has non-demo data. Import stopped to protect it.');

await target.executeMultiple(`
  DELETE FROM player_accounts;
  DELETE FROM registrations;
  DELETE FROM players;
  DELETE FROM tournaments;
  DELETE FROM news;
  DELETE FROM contact_messages;
`);

const tables = [
  ['players', 'id'],
  ['tournaments', 'id'],
  ['registrations', 'id'],
  ['player_accounts', 'clerk_user_id'],
  ['news', 'id'],
  ['contact_messages', 'id'],
];
let total = 0;
for (const [table, conflictKey] of tables) {
  const rows = source.prepare(`SELECT * FROM "${table}"`).all();
  if (!rows.length) continue;
  const columns = Object.keys(rows[0]);
  const quoted = columns.map(column => `"${column}"`).join(',');
  const placeholders = columns.map(() => '?').join(',');
  const updates = columns.filter(column => column !== conflictKey).map(column => `"${column}"=excluded."${column}"`).join(',');
  const sql = `INSERT INTO "${table}"(${quoted}) VALUES(${placeholders}) ON CONFLICT("${conflictKey}") DO UPDATE SET ${updates}`;
  for (let start = 0; start < rows.length; start += 50) {
    const batch = rows.slice(start, start + 50).map(row => ({ sql, args: columns.map(column => row[column]) }));
    await target.batch(batch, 'write');
  }
  total += rows.length;
}
source.close();
const summary = await Promise.all(tables.map(async ([table]) => {
  const result = await target.execute(`SELECT COUNT(*) AS n FROM "${table}"`);
  return [table, Number(result.rows[0]?.n || 0)];
}));
console.log(JSON.stringify({ importedRows: total, counts: Object.fromEntries(summary) }));
await target.close();
