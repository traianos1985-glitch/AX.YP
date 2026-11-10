import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync } from '../vendor/fflate.js';
import { DOSSIER_CATEGORY_FIELDS, getDossierFieldDefinitions, setDossierFieldValue } from '../dossier-fields.js';
import { buildCategoryArchive, loadPublishedDossierPackages } from '../template-library.js';

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
  const xml = new TextDecoder().decode(docxParts['word/document.xml']);
  const placeholders = [...new Set([...xml.matchAll(/\\{\\{([^{}]+)\\}\\}/gu)].map((match) => match[1]))];
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
  const archive = unzipSync(buildCategoryArchive(violenceTemplates, item));
  assert.equal(Object.keys(archive).length, 6, 'The category export must generate six Word documents');
  for (const [name, bytes] of Object.entries(archive)) {
    assert.match(name, /^\\d{2}-/u);
    const parts = unzipSync(bytes);
    assert.ok(parts['word/document.xml'], name + ' must remain a valid DOCX');
    const xml = new TextDecoder().decode(parts['word/document.xml']);
    assert.doesNotMatch(xml, /\\{\\{[^{}]+\\}\\}/u, name + ' must not contain unresolved placeholders');
  }
} finally {
  globalThis.fetch = originalFetch;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}

console.log('Violence official dossier package tests passed: six DOCX files, complete mappings, schema targets, loader registration, and generated output.');
