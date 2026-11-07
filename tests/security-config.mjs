import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const storage = await readFile(new URL('../storage.js', import.meta.url), 'utf8');
const csp = html.match(/Content-Security-Policy" content="([^"]+)"/u)?.[1] || '';

assert.ok(csp, 'index.html must declare a CSP for GitHub Pages hosting');
for (const directive of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'self'"]) {
  assert.ok(csp.includes(directive), `CSP must include ${directive}`);
}
assert.ok(csp.includes("style-src 'self' 'unsafe-inline'"), 'CSP must allow the existing inline style block explicitly');
assert.match(storage, /var DB_NAME = 'axyp-local-db'/, 'Storage database must remain app-namespaced');
assert.ok([...storage.matchAll(/'axyp-[a-z0-9-]+'/gu)].length > 5, 'Storage keys must remain app-namespaced');
console.log('Security configuration checks passed: CSP directives and local storage namespaces are explicit.');
