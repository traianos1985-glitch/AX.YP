import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DOSSIER_CATEGORIES } from '../dossier-categories.js';
import {
  DOSSIER_CATEGORY_FIELDS,
  DOSSIER_FIELD_SCHEMA_VERSION,
  getDossierFieldDefinitions,
  getDossierFieldValue,
  setDossierFieldValue
} from '../dossier-fields.js';
import { valueFor } from '../template-library.js';

assert.equal(DOSSIER_FIELD_SCHEMA_VERSION, 1);
assert.deepEqual(Object.keys(DOSSIER_CATEGORY_FIELDS).sort(), DOSSIER_CATEGORIES.map((entry) => entry.id).sort());

for (const category of DOSSIER_CATEGORIES) {
  const fields = getDossierFieldDefinitions(category.id);
  assert.ok(Array.isArray(fields), category.id + ' must expose a field list');
  const paths = fields.map((field) => field.path);
  assert.equal(new Set(paths).size, paths.length, category.id + ' must not repeat field paths');
  for (const field of fields) {
    assert.ok(field.path && field.label && field.group && field.type, category.id + ' field metadata is incomplete');
    assert.ok(['text', 'date', 'time', 'number', 'textarea'].includes(field.type), 'Unsupported field type: ' + field.type);
    assert.equal(typeof field.required, 'boolean');
    assert.ok(['single', 'many'].includes(field.cardinality || 'single'));
  }
}

const kokFields = getDossierFieldDefinitions('kok');
assert.equal(kokFields.length, 1, 'KOK currently exposes only the verified single-vehicle registration field');
const registration = kokFields[0];
assert.equal(registration.path, 'kok.vehicle.registration');
assert.equal(registration.role, 'vehicle');
assert.equal(registration.cardinality, 'single');
assert.equal(registration.required, false);

const data = {};
setDossierFieldValue(data, registration.path, '0012ΚΥΑ');
assert.equal(getDossierFieldValue(data, registration.path), '0012ΚΥΑ', 'Registration values must preserve leading zeros and Greek characters');
assert.equal(valueFor(registration.path, { categoryData: data }), '0012ΚΥΑ', 'DOCX field lookup must read the same saved value');
assert.throws(() => setDossierFieldValue(data, '__proto__.polluted', 'x'), /Μη επιτρεπτή/);

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const hypotheses = await readFile(new URL('../hypotheses.js', import.meta.url), 'utf8');
const templates = await readFile(new URL('../template-library.js', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(html, /id="case-category-fields"/);
assert.match(hypotheses, /renderCategoryFields\(item\.profile \|\| 'generic', item\.categoryData \|\| \{\}\)/);
assert.match(hypotheses, /categoryDataSchemaVersion: DOSSIER_FIELD_SCHEMA_VERSION/);
assert.match(hypotheses, /'interpreter', 'categoryData'\]/, 'Backup validation must accept the versioned category data object');
assert.match(hypotheses, /collectCategoryFieldData\(preservedCase\)/);
assert.match(templates, /kok\.vehicle\.registration/);
assert.match(serviceWorker, /\.\/dossier-fields\.js/);
assert.ok(packageJson.scripts.test.includes('tests/dossier-field-schema.mjs'));

console.log('Schema-driven category field tests passed: category registry, safe nested storage, leading-zero values, and DOCX lookup.');
