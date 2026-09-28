#!/usr/bin/env node
/**
 * Import problem metadata from other online judges into the archive.
 *   npm run import                 # all sources
 *   npm run import -- codeforces   # one or more named sources
 *   npm run import -- --file list.json --source spoj   # custom JSON list (see README)
 */
import fs from 'node:fs';
import { syncSource, upsertArchive } from '../server/services/archive/index.js';
import { SOURCES } from '../server/services/archive/sources.js';

const args = process.argv.slice(2);
const fileIdx = args.indexOf('--file');

if (fileIdx >= 0) {
  const file = args[fileIdx + 1];
  const srcIdx = args.indexOf('--source');
  const source = srcIdx >= 0 ? args[srcIdx + 1] : 'custom';
  if (!/^[a-z0-9_-]{2,32}$/.test(source)) {
    console.error('--source must be a short lower-case key, e.g. spoj');
    process.exit(1);
  }
  const items = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`Imported ${upsertArchive(source, items)} problems into '${source}'`);
  process.exit(0);
}

const wanted = args.length ? args : Object.keys(SOURCES);
let failed = false;
for (const key of wanted) {
  const t0 = Date.now();
  process.stdout.write(`${(SOURCES[key]?.name || key).padEnd(20)} ... `);
  try {
    const n = await syncSource(key);
    console.log(`${n} problems (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    failed = true;
    console.log(`FAILED: ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
