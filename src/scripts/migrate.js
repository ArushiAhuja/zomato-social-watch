import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { query } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, '../migrations/001_initial.sql'), 'utf8');

console.log('running migration...');
try {
  await query(sql);
  console.log('migration complete');
} catch (err) {
  console.error('migration failed:', err.message);
  process.exit(1);
}
process.exit(0);
