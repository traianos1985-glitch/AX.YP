import assert from 'node:assert/strict';
import { DEFAULT_NOISE_TEMPLATES } from '../noise-templates-data.js';
import { unzipSync } from '../vendor/fflate.js';

assert.equal(DEFAULT_NOISE_TEMPLATES.length, 4);
assert.deepEqual(DEFAULT_NOISE_TEMPLATES.map((template) => template.id), ['noise-01', 'noise-02', 'noise-03', 'noise-04']);
for (const template of DEFAULT_NOISE_TEMPLATES) {
  assert.equal(template.category, 'noise');
  assert.ok(template.dataBase64);
  assert.ok(template.fields.length > 0);
  assert.deepEqual(Object.keys(template.mappings).sort(), [...template.fields].sort());
  const parts = unzipSync(Uint8Array.from(Buffer.from(template.dataBase64, 'base64')));
  const xml = new TextDecoder().decode(parts['word/document.xml']);
  assert.match(xml, /\{\{[a-zA-Z0-9_.-]+\}\}/);
}
console.log('Noise dossier templates regression tests passed.');
