import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const serviceWorker = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8');
const match = serviceWorker.match(/const CACHE_NAME = "axyp-([a-f0-9]{16})";/);
assert.ok(match, 'Production service worker must contain a deterministic 16-character asset hash');
assert.doesNotMatch(serviceWorker, /axyp-dev|axyp-v\\d+/u, 'Development or manually versioned cache identifiers must not ship');
console.log('Production service-worker cache hash test passed: axyp-' + match[1]);
