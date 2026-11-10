import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { unzipSync, unzlibSync, strFromU8 } from '../vendor/fflate.js';
import { base64ToUint8, buildDocx, getMissingTemplateFields } from '../template-library.js';
import { getDossierFieldDefinitions } from '../dossier-fields.js';
import { evaluateDossierCompleteness } from '../dossier-completeness.js';
import { resolvePublishedDocumentName } from '../template-library.js';

const catalog = JSON.parse(await readFile(new URL('../dossier-packages/manifest.json', import.meta.url), 'utf8'));
const entry = catalog.packages.find((item) => item.id === 'migration-v1');
assert.ok(entry, 'The migration package must be published in the static catalog');

const descriptor = JSON.parse(await readFile(new URL('../dossier-packages/' + entry.file, import.meta.url), 'utf8'));
assert.equal(descriptor.encoding, 'base64-chunks');
assert.equal(descriptor.category, 'migration');

const chunks = await Promise.all(descriptor.parts.map((part) => readFile(new URL('../dossier-packages/' + part, import.meta.url), 'utf8')));
const packageBytes = base64ToUint8(chunks.join(''));
assert.equal(packageBytes.length, descriptor.byteLength);

const manifest = JSON.parse(strFromU8(unzlibSync(packageBytes)));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.category, 'migration');
assert.equal(manifest.documents.length, 6);
assert.deepEqual(manifest.documents.map((doc) => resolvePublishedDocumentName('migration', doc.name)), [
  '01_ΚΑΤΑΘΕΣΗ_ΑΣΤΥΝΟΜΙΚΟΥ.docx',
  '02_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ.docx',
  '03_ΕΚΘΕΣΗ_ΕΞΕΤΑΣΗΣ_ΚΑΤΗΓΟΡΟΥΜΕΝΟΥ_ΜΕ_ΔΙΕΡΜΗΝΕΑ.docx',
  '04_ΔΕΛΤΙΟ_ΣΤΟΙΧΕΙΩΝ_ΤΑΥΤΟΤΗΤΑΣ_ΚΑΤΗΓΟΡΟΥΜΕΝΟΥ.docx',
  '05_ΕΓΓΡΑΦΟ_ΓΙΑ_ΑΛΛΟΔΑΠΟ_ΠΟΥ_ΔΕΝ_ΕΧΕΙ_ΣΥΛΛΗΦΘΕΙ_ΞΑΝΑ.docx',
  '06_ΥΠΟΒΟΛΗ_ΔΙΚΟΓΡΑΦΙΑΣ.docx'
 ]);
assert.equal(resolvePublishedDocumentName('migration', '05_ΕΓΓΡΑΦΟ_ΔΙΑΛΟΓΗΣ_ΑΣΥΛΟΥ.docx'), '05_ΕΓΓΡΑΦΟ_ΓΙΑ_ΑΛΛΟΔΑΠΟ_ΠΟΥ_ΔΕΝ_ΕΧΕΙ_ΣΥΛΛΗΦΘΕΙ_ΞΑΝΑ.docx');
const migrationChecklist = evaluateDossierCompleteness('migration', {}, () => '');
assert.equal(migrationChecklist.hasCategoryChecklist, true, 'Migration must have a category-specific completeness checklist');
assert.equal(migrationChecklist.categoryLabel, 'Απελάσεις αλλοδαπών');
assert.ok(migrationChecklist.groups.length >= 3, 'Migration checklist must expose its category groups');
assert.ok(migrationChecklist.groups.every((group) => group.total > 0), 'Migration checklist groups must contain fields');

const profile = {
  name: 'ΑΣΤΥΝΟΜΙΚΟ ΤΜΗΜΑ ΠΑΡΑΔΕΙΓΜΑΤΟΣ',
  directorate: 'ΔΙΕΥΘΥΝΣΗ ΑΣΤΥΝΟΜΙΑΣ ΠΑΡΑΔΕΙΓΜΑΤΟΣ',
  regionalDirectorate: 'ΓΕΝΙΚΗ ΠΕΡΙΦΕΡΕΙΑΚΗ ΑΣΤΥΝΟΜΙΚΗ ΔΙΕΥΘΥΝΣΗ',
  regionalDirectoratePrefix: 'ΓΕΝΙΚΗ ΠΕΡΙΦΕΡΕΙΑΚΗ ΑΣΤΥΝΟΜΙΚΗ',
  address: 'Οδός Παραδείγματος 1',
  phone: 'TEST-SERVICE-PHONE',
  email: 'service@example.police.gr',
  location: 'Παράδειγμα',
  locationUpper: 'ΠΑΡΑΔΕΙΓΜΑ',
  postalCode: '10000',
  commanderFullName: 'ΠΑΠΑΔΟΠΟΥΛΟΣ Γεώργιος',
  commanderRank: 'ΑΣΤΥΝΟΜΟΣ Α΄'
};
globalThis.window = { AXYP_SERVICE_PROFILE: { get: () => profile } };

const categoryData = { migration: {} };
const setPath = (root, path, value) => {
  const parts = path.split('.');
  let current = root;
  for (const part of parts.slice(0, -1)) current = current[part] ||= {};
  current[parts.at(-1)] = value;
};

const allMappings = new Set(manifest.documents.flatMap((doc) => Object.values(doc.mappings)));
const schemaPaths = new Set(getDossierFieldDefinitions('migration').map((field) => field.path));

for (const path of allMappings) {
  if (path.startsWith('migration.')) {
    assert.ok(schemaPaths.has(path), 'The category form must expose ' + path);
  }
}

for (const path of allMappings) {
  if (!path.startsWith('migration.')) continue;
  let value = 'TEST-' + path.toUpperCase().replaceAll('.', '-');
  if (/\.date$/iu.test(path) || /\.birthDate$/iu.test(path) || /\.idDate$/iu.test(path) || /\.releaseDate$/iu.test(path)) value = '2026-09-29';
  if (/\.Time$/iu.test(path) || /\.dutyStartTime$/iu.test(path) || /\.dutyEndTime$/iu.test(path) || /\.releaseTime$/iu.test(path)) value = '10:15';
  if (/\.idYear$/iu.test(path)) value = '2023';
  setPath(categoryData, path, value);
}

const syntheticCase = {
  id: 'case-migration-sample',
  title: 'Δικογραφία Απελάσεων Αλλοδαπών',
  category: 'migration',
  protocolNumber: '1000/2026',
  location: 'Κυπαρισσία',
  date: '2026-09-28',
  time: '21:40',
  incidentDate: '2026-09-28',
  incidentTime: '21:20',
  incidentLocation: 'Φιλιατρά',
  offender: {
    surname: 'ΠΑΠΑΔΟΠΟΥΛΟΣ',
    name: 'Ιωάννης',
    fatherName: 'Νικολάου',
    motherName: 'Μαρίας',
    birthDate: '1995-05-15',
    birthPlace: 'Αλβανία',
    residence: 'Αγρίλη',
    nationalityGenitive: 'Αλβανίας',
    idNumber: 'TEST-OFFENDER-IDNUMBER',
    idDate: '2024-01-10',
    idService: 'Αρχές Αλβανίας'
  },
  officerA: {
    fullName: 'Αστυνόμος Β΄ ΑΝΤΩΝΙΟΥ Μαρία',
    rank: 'Αστυνόμος Β΄',
    surname: 'ΑΝΤΩΝΙΟΥ',
    name: 'Μαρία'
  },
  officerB: {
    fullName: 'Ανθυπαστυνόμος ΔΗΜΗΤΡΙΟΥ Κωνσταντίνος',
    rank: 'Ανθυπαστυνόμος',
    surname: 'ΔΗΜΗΤΡΙΟΥ',
    name: 'Κωνσταντίνος'
  },
  timeline: {
    witness: { startTime: '21:55', endTime: '22:05' },
    arrest: { startTime: '21:40', endTime: '21:50' },
    examination: { startTime: '22:10', endTime: '22:25' }
  },
  categoryData
};

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;
const forbidden = [
  /\b\d{9}\b/u,
  /\b\d{10,13}\b/u,
  emailPattern,
  /(?<![A-Za-z0-9\u0370-\u03ff])[A-Z\u0391-\u03a9]{1,2}\s*\d{6,8}(?![A-Za-z0-9\u0370-\u03ff])/u,
  /(?<![A-Za-z0-9\u0370-\u03ff])[A-Z\u0391-\u03a9]{2,3}[- ]\d{3,4}(?![A-Za-z0-9\u0370-\u03ff])/u
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
  assert.ok(parts['docProps/core.xml'], document.name + ' must include anonymized core metadata');
  const coreXml = new TextDecoder().decode(parts['docProps/core.xml']);
  assert.ok(coreXml.includes('<dc:creator>AXYP</dc:creator>'), document.name + ' must not retain the source document author');
  assert.ok(coreXml.includes('<cp:lastModifiedBy>AXYP</cp:lastModifiedBy>'), document.name + ' must not retain the source Word user identifier');
  assert.doesNotMatch(coreXml, /<dcterms:(?:created|modified)>/u, document.name + ' must not expose original document timestamps');

  const template = {
    ...document, category: 'migration', source: 'published-package',
    files: Object.fromEntries(Object.entries(parts).map(([name, bytes]) => [name, Array.from(bytes)]))
  };

  assert.deepEqual(getMissingTemplateFields(template, syntheticCase), [], document.name + ' must have every required mapped field populated');

  const generated = unzipSync(buildDocx(template, syntheticCase));

  for (const [name, bytes] of Object.entries(generated)) {
    if (!name.startsWith('word/') || !(name.endsWith('.xml') || name.endsWith('.rels'))) continue;
    const xml = new TextDecoder().decode(bytes);
    assert.doesNotMatch(xml, /\{\{\s*[\w.-]+\s*\}\}/u, document.name + ' must not retain unresolved placeholders in ' + name);
    const generatedEmails = xml.match(new RegExp(emailPattern.source, 'giu')) || [];
    for (const email of generatedEmails) {
      assert.equal(email, profile.email, document.name + ' may contain only the explicitly configured synthetic service-profile email, never an email from the source dossier');
    }
    for (const pattern of forbidden) {
      if (pattern === emailPattern) continue;
      assert.doesNotMatch(xml, pattern, document.name + ' generated output must remain anonymized');
    }

    // xmllint check
    const xmllint = spawnSync('xmllint', ['--noout', '-'], { input: Buffer.from(bytes) });
    assert.equal(xmllint.status, 0, `Generated ${document.name} part ${name} must be valid XML: ${xmllint.stderr?.toString()}`);
  }
}

console.log('Migration official package tests passed: six source documents, placeholder mapping, privacy scan, DOCX generation, and XML validation.');
