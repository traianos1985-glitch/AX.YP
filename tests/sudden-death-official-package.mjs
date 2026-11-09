import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync, unzlibSync, strFromU8 } from '../vendor/fflate.js';
import { base64ToUint8, buildDocx, getMissingTemplateFields } from '../template-library.js';

const catalog = JSON.parse(await readFile(new URL('../dossier-packages/manifest.json', import.meta.url), 'utf8'));
const entry = catalog.packages.find((item) => item.id === 'sudden-death-v1');
assert.ok(entry, 'The sudden-death package must be published in the static catalog');
const descriptor = JSON.parse(await readFile(new URL('../dossier-packages/' + entry.file, import.meta.url), 'utf8'));
assert.equal(descriptor.encoding, 'base64-chunks');
const chunks = await Promise.all(descriptor.parts.map((part) => readFile(new URL('../dossier-packages/' + part, import.meta.url), 'utf8')));
const packageBytes = base64ToUint8(chunks.join(''));
assert.equal(packageBytes.length, descriptor.byteLength);
const manifest = JSON.parse(strFromU8(unzlibSync(packageBytes)));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.category, 'sudden-death');
assert.equal(manifest.documents.length, 5);
assert.deepEqual(manifest.documents.map((doc) => doc.name), [
  '01_ΕΓΓΡΑΦΟ_ΝΟΣΟΚΟΜΕΙΟΥ.docx',
  '02_ΕΓΓΡΑΦΟ_ΠΡΟΣ_ΠΡΕΣΒΕΙΑ.docx',
  '03_ΕΞΕΤΑΣΗ_ΜΑΡΤΥΡΑ_ΜΕ_ΔΙΕΡΜΗΝΕΑ.docx',
  '04_ΠΑΡΑΓΓΕΛΙΑ_ΙΑΤΡΟΔΙΚΑΣΤΙΚΗΣ.docx',
  '05_ΜΕΤΑΦΟΡΑ_ΠΤΩΜΑΤΟΣ.docx'
]);

const profile = {
  name: 'TEST-SERVICE-NAME', directorate: 'TEST-DIRECTORATE',
  address: 'TEST-SERVICE-ADDRESS', phone: 'TEST-SERVICE-PHONE',
  email: 'test-service@example.invalid', location: 'TEST-SERVICE-CITY'
};
globalThis.window = { AXYP_SERVICE_PROFILE: { get: () => profile } };

const categoryData = { suddenDeath: {} };
const setPath = (root, path, value) => {
  const parts = path.split('.');
  let current = root;
  for (const part of parts.slice(0, -1)) current = current[part] ||= {};
  current[parts.at(-1)] = value;
};
const allMappings = new Set(manifest.documents.flatMap((doc) => Object.values(doc.mappings)));
for (const path of allMappings) {
  if (!path.startsWith('suddenDeath.')) continue;
  let value = 'TEST-' + path.toUpperCase().replaceAll('.', '-');
  if (/\.date$/u.test(path) || /\.birthDate$/u.test(path) || /\.idDate$/u.test(path)) value = '2026-11-09';
  if (/\.Time$/u.test(path)) value = '10:15';
  if (/\.age$/u.test(path) || /\.yearsInResidence$/u.test(path)) value = '58';
  setPath(categoryData, path, value);
}
const syntheticCase = {
  id: 'sudden-death-package-test', profile: 'sudden-death',
  title: 'TEST-SUDDEN-DEATH', protocolNumber: 'TEST-PROTOCOL',
  date: '2026-11-09', time: '10:00', location: 'TEST-LOCATION',
  officerA: { surname: 'TEST-OFFICER-A-SURNAME', name: 'TEST-OFFICER-A-NAME' },
  officerB: { surname: 'TEST-OFFICER-B-SURNAME', name: 'TEST-OFFICER-B-NAME' },
  categoryData
};
const forbidden = [
  /ZORICI|STOLNICIEANU|FOTINOPOULOS|6982168385|0040784610737/iu,
  /atena\.consul@mae\.ro|at\.trifylias@astynomia\.gr/iu,
  /RK522065|2761440980|2761440971/iu
];

for (const document of manifest.documents) {
  const placeholders = new Set();
  const parts = Object.fromEntries(Object.entries(document.parts).map(([name, part]) => {
    const bytes = part.encoding === 'utf8' ? new TextEncoder().encode(part.data) : base64ToUint8(part.data);
    if (name.startsWith('word/') && (name.endsWith('.xml') || name.endsWith('.rels'))) {
      const source = new TextDecoder().decode(bytes);
      for (const match of source.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/gu)) placeholders.add(match[1]);
      for (const pattern of forbidden) assert.doesNotMatch(source, pattern, document.name + ' must not contain source personal identifiers');
    }
    return [name, bytes];
  }));
  for (const path of placeholders) {
    assert.ok(document.mappings[path], document.name + ' must map ' + path);
  }
  assert.ok(parts['word/document.xml'], document.name + ' must contain the main Word document');
  const template = {
    ...document, category: 'sudden-death', source: 'published-package',
    files: Object.fromEntries(Object.entries(parts).map(([name, bytes]) => [name, Array.from(bytes)]))
  };
  assert.deepEqual(getMissingTemplateFields(template, syntheticCase), [], document.name + ' must have every required mapped field populated');
  const generated = unzipSync(buildDocx(template, syntheticCase));
  for (const [name, bytes] of Object.entries(generated)) {
    if (!name.startsWith('word/') || !(name.endsWith('.xml') || name.endsWith('.rels'))) continue;
    const xml = new TextDecoder().decode(bytes);
    assert.doesNotMatch(xml, /\{\{\s*[\w.-]+\s*\}\}/u, document.name + ' must not retain unresolved placeholders in ' + name);
    for (const pattern of forbidden) assert.doesNotMatch(xml, pattern, document.name + ' generated output must remain anonymized');
  }
}
console.log('Sudden-death official package tests passed: five source documents, placeholder mapping, privacy scan, and DOCX generation.');
