import assert from 'node:assert/strict';
import { DEFAULT_CAMPING_TEMPLATES } from '../camping-templates-data.js';
import { unzipSync } from '../vendor/fflate.js';
assert.equal(DEFAULT_CAMPING_TEMPLATES.length, 4);
assert.deepEqual(DEFAULT_CAMPING_TEMPLATES.map((template) => template.id), ['camping-01', 'camping-02', 'camping-03', 'camping-04']);
for (const template of DEFAULT_CAMPING_TEMPLATES) {
  assert.equal(template.category, 'camping');
  assert.ok(template.dataBase64);
  assert.ok(template.fields.length > 0);
  const parts = unzipSync(Uint8Array.from(Buffer.from(template.dataBase64, 'base64')));
  const xml = new TextDecoder().decode(parts['word/document.xml']);
  assert.match(xml, /\{\{[a-zA-Z0-9_.-]+\}\}/);
}
console.log('Camping dossier templates regression tests passed.');
