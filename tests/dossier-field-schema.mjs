import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DOSSIER_CATEGORIES } from '../dossier-categories.js';
import {
  DOSSIER_CATEGORY_FIELDS,
  DOSSIER_FIELD_SCHEMA_VERSION,
  DOSSIER_REPEATABLE_GROUPS,
  appendRepeatableEntry,
  getRepeatableGroupDefinition,
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

// Repeatable groups are structurally supported but remain inactive in the UI.
for (const groupId of ['offenders', 'vehicles']) {
  const definition = getRepeatableGroupDefinition(groupId);
  assert.ok(definition, groupId + ' must have a dormant repeatable definition');
  assert.equal(definition.cardinality, 'many');
  assert.equal(definition.enabled, false, 'Multi-entity UI must remain disabled until real DOCX review');
  assert.equal(DOSSIER_REPEATABLE_GROUPS[groupId].enabled, false);
}
const dormantEntities = {};
assert.equal(appendRepeatableEntry(dormantEntities, 'offenders', { role: 'offender', fullName: 'Synthetic Person A' }), 1);
assert.equal(appendRepeatableEntry(dormantEntities, 'offenders', { role: 'offender', fullName: 'Synthetic Person B' }), 2);
assert.equal(dormantEntities.entities.offenders.length, 2);
assert.deepEqual(dormantEntities.entities.offenders.map((entry) => entry.fullName), ['Synthetic Person A', 'Synthetic Person B']);
assert.equal(appendRepeatableEntry(dormantEntities, 'vehicles', { registration: 'TEST-001' }), 1);
assert.equal(dormantEntities.entities.vehicles[0].registration, 'TEST-001');
assert.throws(() => appendRepeatableEntry(dormantEntities, 'offenders', 'invalid'), /Η εγγραφή/);
assert.throws(() => appendRepeatableEntry(dormantEntities, 'unknown', {}), /Άγνωστη/);

const narcoticsFields = getDossierFieldDefinitions('narcotics');
assert.ok(narcoticsFields.some((field) => field.path === 'narcotics.policeWitness.fullName'));
assert.ok(narcoticsFields.some((field) => field.path === 'narcotics.apprehendingOfficer.fullName'));
assert.ok(narcoticsFields.some((field) => field.path === 'narcotics.exhibits.cannabis.quantity' && field.type === 'number' && field.step === '0.01' && field.min === 0));
assert.ok(narcoticsFields.some((field) => field.path === 'narcotics.exhibits.cigarette.quantity' && field.type === 'number' && field.step === '1' && field.min === 0));
assert.ok(narcoticsFields.some((field) => field.path === 'narcotics.offender.statement' && field.type === 'textarea'));
assert.equal(new Set(narcoticsFields.map((field) => field.path)).size, narcoticsFields.length);

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
assert.doesNotMatch(html, /Προσθήκη (?:δεύτερου )?δράστη|Προσθήκη (?:δεύτερου )?οχήματος/i, 'No multi-entity controls should be visible yet');
assert.match(hypotheses, /renderCategoryFields\(item\.profile \|\| 'generic', item\.categoryData \|\| \{\}\)/);
assert.match(hypotheses, /categoryDataSchemaVersion: DOSSIER_FIELD_SCHEMA_VERSION/);
assert.match(hypotheses, /'interpreter', 'categoryData'\]/, 'Backup validation must accept the versioned category data object');
assert.match(hypotheses, /collectCategoryFieldData\(preservedCase\)/);
assert.match(templates, /kok\.vehicle\.registration/);
assert.match(serviceWorker, /\.\/dossier-fields\.js/);
assert.ok(packageJson.scripts.test.includes('tests/dossier-field-schema.mjs'));

console.log('Schema-driven category field tests passed: category registry, safe nested storage, leading-zero values, and DOCX lookup.');

const violencePaths = getDossierFieldDefinitions('violence').map((field) => field.path);
for (const path of [
  'violence.witnessA.surname',
  'violence.witnessA.idNumber',
  'violence.witnessB.surname',
  'violence.witnessB.idNumber',
  'violence.accused.residenceLocality',\n  'violence.accused.residenceInExamination',\n  'violence.accused.residencePostalCode',\n  'violence.apprehendingOfficer.fullName',
  'violence.investigators.accusedExaminerSurname',
  'violence.investigators.witnessAExaminerSurname',
  'violence.investigators.witnessBExaminerSurnameUpper',
  'violence.service.areaGenitive',
  'violence.service.directorateGenitive'
]) assert.ok(violencePaths.includes(path), 'Violence dossier must expose ' + path);
assert.ok(getDossierFieldDefinitions('violence').every((field) => field.required === false),
  'Violence source-specific values must remain optional until the operator confirms the document');
