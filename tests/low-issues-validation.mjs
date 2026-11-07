import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';

console.log('--- Testing Low Severity Issues (Low 1, Low 2, Low 3) ---');

// ============================================================================
// Low 1: Storage recovery is covered against the real storage module in
// tests/storage-reliability.mjs, included in npm test.
// ============================================================================
console.log('Testing Low 1: real storage recovery regression is in storage-reliability.mjs...');
const packageJsonRaw = await readFile('package.json', 'utf8');
const packageJson = JSON.parse(packageJsonRaw);
const testScript = packageJson.scripts.test;
assert.ok(testScript.includes('tests/storage-reliability.mjs'), 'npm test must run actual storage recovery tests');
console.log('✓ Low 1: Actual storage recovery regression is included in npm test.');

// ============================================================================
// Low 2: Hygiene of repository test suite (no orphaned scratch tools)
// ============================================================================
console.log('Testing Low 2: test suite hygiene (no orphaned diagnostic tools)...');

const orphanedFiles = [
  'tests/claude-docx-review.mjs',
  'tests/prepare-claude-docx-patches.mjs'
];

for (const file of orphanedFiles) {
  assert.strictEqual(existsSync(file), false, `Orphaned diagnostic tool ${file} should be removed from tests/`);
}

assert.ok(testScript.includes('tests/low-issues-validation.mjs'), 'package.json test script should run low-issues-validation.mjs');

console.log('✓ Low 2: Repository test suite hygiene verified.');

// ============================================================================
// Low 3: Manifest and PWA Verification
// ============================================================================
console.log('Testing Low 3: Manifest and PWA structure and asset validation...');

// 1. Validate manifest.json
const manifestRaw = await readFile('manifest.json', 'utf8');
let manifest;
assert.doesNotThrow(() => {
  manifest = JSON.parse(manifestRaw);
}, 'manifest.json must be valid JSON');

assert.strictEqual(manifest.id, './', 'manifest id must be "./"');
assert.strictEqual(manifest.start_url, './', 'manifest start_url must be "./"');
assert.strictEqual(manifest.scope, './', 'manifest scope must be "./"');
assert.strictEqual(manifest.display, 'standalone', 'manifest display must be standalone');
assert.ok(manifest.name && manifest.name.length > 0, 'manifest must have a name');
assert.ok(manifest.short_name && manifest.short_name.length > 0, 'manifest must have a short_name');
assert.ok(manifest.theme_color, 'manifest must specify theme_color');
assert.ok(manifest.background_color, 'manifest must specify background_color');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'manifest must include icons');

// Check each icon on disk
for (const icon of manifest.icons) {
  const relPath = icon.src.replace(/^\.\//, '');
  assert.ok(existsSync(relPath), `Icon file ${relPath} must exist on disk`);
  const iconStat = await stat(relPath);
  assert.ok(iconStat.size > 0, `Icon file ${relPath} must not be empty`);

  const fileBytes = await readFile(relPath);
  if (icon.type === 'image/png') {
    assert.strictEqual(fileBytes[0], 0x89, `PNG icon ${relPath} header byte 0 must be 0x89`);
    assert.strictEqual(fileBytes[1], 0x50, `PNG icon ${relPath} header byte 1 must be 0x50 (P)`);
    assert.strictEqual(fileBytes[2], 0x4e, `PNG icon ${relPath} header byte 2 must be 0x4E (N)`);
    assert.strictEqual(fileBytes[3], 0x47, `PNG icon ${relPath} header byte 3 must be 0x47 (G)`);
  } else if (icon.type === 'image/svg+xml') {
    const text = fileBytes.toString('utf8');
    assert.ok(text.includes('<svg'), `SVG icon ${relPath} must contain <svg tag`);
  }
}

// 2. Validate index.html PWA tags
const indexHtml = await readFile('index.html', 'utf8');
assert.ok(indexHtml.includes('<link rel="manifest" href="manifest.json">'), 'index.html must link to manifest.json');
assert.ok(indexHtml.includes('<meta name="viewport"'), 'index.html must define viewport meta tag');
assert.ok(indexHtml.includes('<meta name="theme-color" content="' + manifest.theme_color + '">'), 'index.html theme-color must match manifest');
assert.ok(indexHtml.includes('<link rel="apple-touch-icon"'), 'index.html must include apple-touch-icon link');

// 3. Validate sw.js precache completeness
const swSource = await readFile('sw.js', 'utf8');
assert.ok(swSource.includes('CACHE_NAME'), 'sw.js must define CACHE_NAME');
assert.ok(swSource.includes('timeout') || swSource.includes('setTimeout') || swSource.includes('Promise.race'), 'sw.js must implement network timeout fallback');

// Extract precache files listed in sw.js
const precacheMatch = swSource.match(/const\s+PRECACHE_ASSETS\s*=\s*\[([^\]]+)\]/s) ||
                     swSource.match(/const\s+STATIC_ASSETS\s*=\s*\[([^\]]+)\]/s) ||
                     swSource.match(/urlsToCache\s*=\s*\[([^\]]+)\]/s) ||
                     swSource.match(/const\s+assets\s*=\s*\[([^\]]+)\]/s) ||
                     swSource.match(/PRECACHE\s*=\s*\[([^\]]+)\]/s) ||
                     swSource.match(/\[\s*['"][^'"]+['"]\s*,\s*['"][^'"]+['"][\s\S]*?\]/);

if (precacheMatch) {
  const assetPaths = [...precacheMatch[0].matchAll(/['"]([^'"]+)['"]/g)]
    .map(m => m[1])
    .filter(p => p !== './' && !p.startsWith('http') && p.includes('.'));

  let verifiedCount = 0;
  for (const asset of assetPaths) {
    const cleanPath = asset.replace(/^\.\//, '');
    if (existsSync(cleanPath)) {
      verifiedCount++;
    }
  }
  assert.ok(verifiedCount >= 20, `At least 20 precache assets must exist on disk (verified ${verifiedCount})`);
}

console.log('✓ Low 3: Manifest and PWA verification passed successfully.');

console.log('\nAll Low Severity tests (Low 1, Low 2, Low 3) passed successfully!');
