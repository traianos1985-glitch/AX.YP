import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync } from '../vendor/fflate.js';
import { DOSSIER_CATEGORY_FIELDS, getDossierFieldDefinitions, setDossierFieldValue } from '../dossier-fields.js';
import { buildCategoryArchive, getMissingTemplateFields, loadPublishedDossierPackages } from '../template-library.js';

const catalog = JSON.parse(await readFile(new URL('../dossier-packages/manifest.json', import.meta.url), 'utf8'));
const catalogEntry = catalog.packages.find((entry) => entry.id === 'violence-v1');
assert.ok(catalogEntry, 'Violence package must be registered in the published package catalog');
assert.equal(catalogEntry.file, 'violence-v1.axyp.zip');

const packageBytes = new Uint8Array(await readFile(new URL('../dossier-packages/violence-v1.axyp.zip', import.meta.url)));
const packageParts = unzipSync(packageBytes);
assert.ok(packageParts['manifest.json'], 'Package ZIP must contain its manifest');
const manifest = JSON.parse(new TextDecoder().decode(packageParts['manifest.json']));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.id, 'violence-v1');
assert.equal(manifest.category, 'violence');
assert.equal(manifest.documents.length, 6, 'The official package must contain all six source documents');

const definitions = getDossierFieldDefinitions('violence');
const definedPaths = new Set(definitions.map((field) => field.path));
assert.ok(DOSSIER_CATEGORY_FIELDS.violence);
for (const path of ['violence.accused.residenceLocality', 'violence.accused.birthPlace', 'violence.accused.residenceInExamination', 'violence.accused.residencePostalCode', 'violence.accused.surname', 'violence.accused.fullNameGenitive', 'violence.accused.givenName', 'violence.apprehendingOfficer.fullName', 'violence.apprehendingOfficer.rank', 'violence.case.dateLong', 'violence.case.weekday', 'violence.investigators.witnessBExaminerGivenNameGenitive']) assert.ok(definedPaths.has(path), 'Missing privacy field: ' + path);
assert.ok(definitions.every((field) => field.required === false),
  'Source-specific fields must remain optional until the operator confirms them');
const commonPaths = new Set(['case.location', 'case.dateGreek', 'service.name', 'service.phone']);

for (const document of manifest.documents) {
  assert.ok(packageParts[document.path], document.name + ' must exist inside the package');
  assert.ok(Array.isArray(document.fields) && document.fields.length, document.name + ' must declare fields');
  assert.ok(document.mappings && typeof document.mappings === 'object');
  assert.deepEqual(Object.keys(document.mappings).sort(), [...document.fields].sort(),
    document.name + ' must map every declared placeholder exactly once');
  for (const [placeholder, target] of Object.entries(document.mappings)) {
    assert.ok(definedPaths.has(target) || commonPaths.has(target),
      document.name + ' maps ' + placeholder + ' to an undeclared field: ' + target);
  }
  const docxParts = unzipSync(packageParts[document.path]);
  assert.ok(docxParts['word/document.xml'], document.name + ' must be a valid DOCX with a main document');
  assert.ok(docxParts['docProps/core.xml'], document.name + ' must include anonymized core metadata');
  const coreXml = new TextDecoder().decode(docxParts['docProps/core.xml']);
  assert.ok(coreXml.includes('<dc:creator>AX.YP</dc:creator>'), document.name + ' must not retain the source document author');
  assert.ok(coreXml.includes('<cp:lastModifiedBy>AX.YP</cp:lastModifiedBy>'), document.name + ' must not retain the source Word user identifier');
  assert.doesNotMatch(coreXml, /<dcterms:(?:created|modified)>/u, document.name + ' must not expose original document timestamps');
  const appXml = new TextDecoder().decode(docxParts['docProps/app.xml']);
  assert.ok(appXml.includes('<Template>AX.YP</Template>'), document.name + ' must not expose the original template path');
  const xmlParts = Object.entries(docxParts).filter(([partName]) => partName.endsWith('.xml') || partName.endsWith('.rels'));
  for (const [partName, bytes] of xmlParts) {
    const partXml = new TextDecoder().decode(bytes);
    assert.doesNotMatch(partXml, /\b\d{9}\b/u, document.name + ' must not retain nine-digit personal identifiers in ' + partName);
    assert.doesNotMatch(partXml, /\b\d{10,13}\b/u, document.name + ' must not retain phone-like identifiers in ' + partName);
    assert.doesNotMatch(partXml, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu, document.name + ' must not retain email addresses in ' + partName);
    assert.doesNotMatch(partXml, /(?<![A-ZΑ-Ω0-9])[A-ZΑ-Ω]{1,2}\d{6,8}(?!\d)/iu, document.name + ' must not retain identity/passport-like identifiers in ' + partName);
    assert.doesNotMatch(partXml, /(?<!\d)\d{1,2}[./-]\d{1,2}[./-](?:19|20)\d{2}(?!\d)/u, document.name + ' must not retain fixed case dates in ' + partName);
  }
  const xml = new TextDecoder().decode(docxParts['word/document.xml']);
  const placeholders = [...new Set([...xml.matchAll(/\{\{([^{}]+)\}\}/gu)].map((match) => match[1]))];
  for (const placeholder of placeholders) {
    assert.ok(Object.hasOwn(document.mappings, placeholder),
      document.name + ' contains an unmapped placeholder: ' + placeholder);
  }
  for (const field of document.fields) {
    assert.ok(Object.hasOwn(document.mappings, field),
      document.name + ' declares an unmapped field: ' + field);
  }
}

const originalFetch = globalThis.fetch;
const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
try {
  globalThis.document = { baseURI: 'https://axyp-test.invalid/' };
  globalThis.window = { AXYP_SERVICE_PROFILE: { get: () => ({
    name: 'TEST SERVICE',
    phone: '0000000000',
    areaGenitive: 'TEST AREA',
    directorateGenitive: 'TEST DIRECTORATE'
  }) } };
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/manifest.json')) {
      return { ok: true, json: async () => ({ schemaVersion: 1, packages: [{ id: 'violence-v1', file: 'violence-v1.axyp.zip' }] }) };
    }
    if (url.pathname.endsWith('/violence-v1.axyp.zip')) {
      return { ok: true, arrayBuffer: async () => packageBytes.buffer.slice(packageBytes.byteOffset, packageBytes.byteOffset + packageBytes.byteLength) };
    }
    return { ok: false };
  };
  const templates = await loadPublishedDossierPackages();
  const violenceTemplates = templates.filter((template) => template.category === 'violence');
  assert.equal(violenceTemplates.length, 6, 'The application loader must expose all six violence documents');
  assert.ok(violenceTemplates.every((template) => template.source === 'published-package'));

  const categoryData = {};
  for (const field of definitions) {
    const value = field.type === 'date' ? '2000-01-02' : 'TEST_' + field.path.split('.').slice(1).join('_').toUpperCase();
    setDossierFieldValue(categoryData, field.path, value);
  }
  const item = {
    id: 'violence-package-test',
    profile: 'violence',
    date: '2026-11-10',
    location: 'TEST LOCATION',
    categoryData
  };
  for (const template of violenceTemplates) {
    const missing = getMissingTemplateFields(template, item);
    assert.deepEqual(missing, [], template.name + ' must have all declared mapped values populated: ' + JSON.stringify(missing));
  }
  const archive = unzipSync(buildCategoryArchive(violenceTemplates, item));
  assert.equal(Object.keys(archive).length, 6, 'The category export must generate six Word documents');
  for (const [name, bytes] of Object.entries(archive)) {
    assert.match(name, /^\d{2}-/u);
    const parts = unzipSync(bytes);
    assert.ok(parts['word/document.xml'], name + ' must remain a valid DOCX');
    const xml = new TextDecoder().decode(parts['word/document.xml']);
    const unresolved = [...xml.matchAll(/\{\{\s*([\p{L}\p{N}_.-]+)\s*\}\}/gu)].map((match) => match[1]);
    assert.deepEqual(unresolved, [], name + ' must not contain unresolved placeholders: ' + unresolved.join(', '));
  }
} finally {
  globalThis.fetch = originalFetch;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}

console.log('Violence official dossier package tests passed: six DOCX files, complete mappings, schema targets, loader registration, and generated output.');
