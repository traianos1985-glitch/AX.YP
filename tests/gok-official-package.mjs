import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { unzipSync, unzlibSync, strFromU8 } from '../vendor/fflate.js';
import { base64ToUint8, buildCategoryArchive, buildDocx, getMissingTemplateFields, loadPublishedDossierPackages } from '../template-library.js';
import { DOSSIER_CATEGORY_FIELDS, getDossierFieldDefinitions } from '../dossier-fields.js';
import { DOSSIER_CATEGORIES } from '../dossier-categories.js';

const catalog = JSON.parse(await readFile(new URL('../dossier-packages/manifest.json', import.meta.url), 'utf8'));
const entry = catalog.packages.find((item) => item.id === 'gok-v1');
assert.ok(entry, 'The GOK dossier must be registered as a separate official package');
assert.equal(entry.file, 'gok-v1.axyp.pack.json');

const descriptor = JSON.parse(await readFile(new URL('../dossier-packages/' + entry.file, import.meta.url), 'utf8'));
assert.equal(descriptor.encoding, 'base64-chunks');
assert.ok(descriptor.parts.length >= 1 && descriptor.parts.length <= 10);
const chunks = await Promise.all(descriptor.parts.map((part) => readFile(new URL('../dossier-packages/' + part, import.meta.url), 'utf8')));
const packageBytes = base64ToUint8(chunks.join(''));
assert.equal(packageBytes.length, descriptor.byteLength);
const packed = JSON.parse(strFromU8(unzlibSync(packageBytes)));
assert.equal(packed.schemaVersion, 1);
assert.equal(packed.category, 'gok');
assert.equal(packed.documents.length, 6);
assert.deepEqual(packed.documents.map((doc) => doc.name), [
  'Έκθεση ένορκης εξέτασης μάρτυρα (αστυνομικού)',
  'Έκθεση σύλληψης',
  'Έκθεση εξέτασης κατηγορουμένου',
  'Διαβιβαστικό – Υποβολή δικογραφίας',
  'Σήμα – ΒΑΣ',
  '06_ΔΕΛΤΙΟ_ΣΤΟΙΧΕΙΩΝ_ΤΑΥΤΟΤΗΤΑΣ_ΚΑΤΗΓΟΡΟΥΜΕΝΟΥ.docx'
]);

const identityTemplate = packed.documents.find((doc) => doc.id === 'gok-06');
assert.ok(identityTemplate, 'The GOK dossier must include an accused identity details form');
assert.deepEqual(new Set(Object.values(identityTemplate.mappings)), new Set([
  'offender.surname', 'offender.name', 'offender.fatherName', 'offender.motherName',
  'offender.birthDate', 'offender.birthPlace', 'gok.accused.residence', 'person.postalCode',
  'offender.idNumber', 'offender.idDate', 'offender.idService', 'offender.taxId',
  'offender.taxOffice', 'gok.accused.profession', 'offender.phone', 'case.location',
  'case.dateGreek', 'gok.policeWitness.surname', 'gok.policeWitness.givenName'
]), 'The GOK identity form must map every placeholder to GOK case data');

assert.ok(DOSSIER_CATEGORIES.some((category) => category.id === 'gok' && category.label.includes('Γ.Ο.Κ.')));
assert.ok(DOSSIER_CATEGORIES.some((category) => category.id === 'kok'), 'The existing KOK category must remain separate');
assert.ok(DOSSIER_CATEGORY_FIELDS.gok);
const schema = getDossierFieldDefinitions('gok');
const schemaPaths = new Set(schema.map((field) => field.path));
assert.equal(schemaPaths.size, schema.length, 'GOK category fields must not contain duplicate paths');
assert.ok(schema.every((field) => field.required === false), 'GOK-specific fields remain optional until the operator confirms the case data');

const profile = {
  name: 'TEST-SERVICE-NAME',
  directorate: 'TEST-SERVICE-DIRECTORATE',
  regionalDirectorate: 'TEST-SERVICE-REGIONAL-DIRECTORATE',
  address: 'TEST-SERVICE-ADDRESS',
  phone: 'TEST-SERVICE-PHONE',
  email: 'test-service@example.invalid',
  location: 'TEST-SERVICE-LOCATION',
  locationUpper: 'TEST-SERVICE-LOCATION-UPPER',
  postalCode: 'TEST-SERVICE-POSTAL',
  commanderFullName: 'TEST-SERVICE-COMMANDER',
  commanderRank: 'TEST-SERVICE-COMMANDER-RANK'
};
const categoryData = { gok: {} };
const setPath = (root, path, value) => {
  const parts = path.split('.');
  let current = root;
  for (const part of parts.slice(0, -1)) current = current[part] ||= {};
  current[parts.at(-1)] = value;
};

const allMappings = new Set(packed.documents.flatMap((doc) => Object.values(doc.mappings)));
const requiredDynamicFields = [
  'gok.case.buildingService', 'gok.case.weekday', 'gok.case.workDimensions',
  'gok.prosecutor.fullName', 'gok.prosecutor.locationGenitive', 'gok.prosecutor.locationUpper',
  'gok.prosecutor.office', 'gok.prosecutor.prosecutorOfficeGenitive', 'gok.prosecutor.postalCode',
  'gok.prosecutor.title', 'gok.service.locationGenitive', 'gok.service.nameGenitive',
  'gok.service.regionGenitive', 'gok.service.regionalDirectorate'
];
for (const path of requiredDynamicFields) {
  assert.ok(schemaPaths.has(path), 'GOK field schema must include ' + path);
  assert.ok(allMappings.has(path), 'GOK document package must use ' + path);
}
for (const path of allMappings) {
  if (path.startsWith('gok.')) {
    assert.ok(schemaPaths.has(path), 'GOK form must expose mapped field ' + path);
    let value = 'TEST-' + path.toUpperCase().replaceAll('.', '-');
    if (/\.birthDate$/u.test(path)) value = '1990-01-02';
    if (/Time$/u.test(path)) value = '10:15';
    if (path === 'gok.policeWitness.idIssueDate') value = '02/02/2020';
    setPath(categoryData, path, value);
  }
}

const syntheticCase = {
  id: 'gok-official-package-test',
  profile: 'gok',
  title: 'TEST-GOK-CASE',
  protocolNumber: 'TEST-PROTOCOL-001',
  date: '2026-11-10',
  time: '10:00',
  location: 'TEST-CASE-LOCATION',
  officerA: {
    fullName: 'TEST-OFFICER-A',
    documentFullName: 'TEST-OFFICER-A-GENITIVE',
    rank: 'TEST-OFFICER-A-RANK',
    surname: 'TEST-OFFICER-A-SURNAME',
    name: 'TEST-OFFICER-A-NAME'
  },
  officerB: {
    fullName: 'TEST-OFFICER-B',
    documentFullName: 'TEST-OFFICER-B-GENITIVE',
    rank: 'TEST-OFFICER-B-RANK',
    surname: 'TEST-OFFICER-B-SURNAME',
    name: 'TEST-OFFICER-B-NAME'
  },
  offender: {
    surname: 'TEST-OFFENDER-SURNAME',
    name: 'TEST-OFFENDER-NAME',
    fatherName: 'TEST-OFFENDER-FATHER',
    motherName: 'TEST-OFFENDER-MOTHER',
    birthDate: '1992-03-04',
    birthPlace: 'TEST-OFFENDER-BIRTH-PLACE',
    city: 'TEST-OFFENDER-CITY',
    address: 'TEST-OFFENDER-ADDRESS',
    postalCode: 'TEST-OFFENDER-POSTAL',
    idNumber: 'TEST-OFFENDER-ID',
    idDate: '2015-05-06',
    idService: 'TEST-OFFENDER-ID-SERVICE',
    taxId: 'TEST-OFFENDER-TAX',
    taxOffice: 'TEST-OFFENDER-TAX-OFFICE',
    phone: 'TEST-OFFENDER-PHONE'
  },
  timeline: {
    witness: { startTime: '09:10', endTime: '09:30' },
    arrest: { startTime: '10:00', endTime: '10:10' },
    examination: { startTime: '10:30', endTime: '11:00' }
  },
  categoryData
};

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;
const forbiddenSource = [
  /\b\d{9}\b/u,
  /\b\d{10,13}\b/u,
  emailPattern,
  /(?<![A-ZΑ-Ω0-9])[A-ZΑ-Ω]{1,2}\d{6,8}(?!\d)/iu,
  /(?<!\d)\d{1,2}[./-]\d{1,2}[./-](?:19|20)\d{2}(?!\d)/u,
  /ΣΤΑΜΑΤΟΠΟΥΛΟΣ|Θεόδωρος|Λεωνίδα/iu,
  /Κυπαρισσίας|Τριφυλίας|Φιλιατρών|Μεσσηνίας|Πελοποννήσου/iu,
  /Μ\.\s*Σάββατο|11\/4\/2015|2015-04-11|09:45/iu,
  /3m\s*χ\s*4m|τριών\s*\(3\)\s*μέτρων\s*επί\s*τεσσάρων\s*\(4\)/iu,
  /σκαλωσιέ|κατασκευή\s+πλάκας\s+βεράντας/iu
];
const forbiddenGenerated = [
  /\b\d{9}\b/u,
  /\b\d{10,13}\b/u,
  /(?<![A-ZΑ-Ω0-9])[A-ZΑ-Ω]{1,2}\d{6,8}(?!\d)/iu,
  ...forbiddenSource.slice(5)
];
const decodeXml = (text) => text.replace(/&apos;/gu, "'").replace(/&quot;/gu, '"').replace(/&gt;/gu, '>').replace(/&lt;/gu, '<').replace(/&amp;/gu, '&');
const visibleParagraphText = (xml) => [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/gu)].map((paragraph) =>
  [...paragraph[1].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gu)].map((node) => decodeXml(node[1])).join('')
).join('\n');
const structureSignature = (xml) => ['p', 'tbl', 'tr', 'tc', 'r', 'rPr', 'pPr', 'sectPr'].map((tag) =>
  `${tag}:${[...xml.matchAll(new RegExp(`<w:${tag}\\b`, 'gu'))].length}`
).join('|');
const xmlParserAvailable = spawnSync('xmllint', ['--version'], { encoding: 'utf8' }).status === 0;
const assertXmlWellFormed = (xml, label) => {
  if (!xmlParserAvailable) return;
  const result = spawnSync('xmllint', ['--noout', '-'], { input: xml, encoding: 'utf8' });
  assert.equal(result.status, 0, label + ' must be well-formed XML: ' + (result.stderr || result.error?.message || 'xmllint failed'));
};

for (const document of packed.documents) {
  assert.ok(Array.isArray(document.fields) && document.fields.length, document.name + ' must declare its placeholders');
  assert.ok(document.fields.every((field) => document.mappings[field]), document.name + ' must map every required placeholder');
  const placeholders = new Set();
  const parts = Object.fromEntries(Object.entries(document.parts).map(([name, part]) => {
    const bytes = part.encoding === 'utf8' ? new TextEncoder().encode(part.data) : base64ToUint8(part.data);
    if (name.endsWith('.xml') || name.endsWith('.rels')) {
      const source = new TextDecoder().decode(bytes);
      assertXmlWellFormed(source, document.name + ' source ' + name);
      if (name.startsWith('word/')) {
        for (const match of source.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/gu)) placeholders.add(match[1]);
      }
      for (const pattern of forbiddenSource) {
        assert.doesNotMatch(source, pattern, document.name + ' must not retain source personal identifiers in ' + name);
        if (name.startsWith('word/')) assert.doesNotMatch(visibleParagraphText(source), pattern, document.name + ' must not retain identifiers split across Word runs in ' + name);
      }
      assert.doesNotMatch(source, /<w:(?:ins|del|commentRangeStart|commentRangeEnd|commentReference)\b/u, document.name + ' must not contain tracked changes or comments');
      assert.doesNotMatch(source, /<w:(?:vanish|webHidden)\b/u, document.name + ' must not conceal source-case text');
    }
    return [name, bytes];
  }));
  assert.deepEqual([...placeholders].sort(), Object.keys(document.mappings).sort(), document.name + ' every placeholder must have exactly one mapping');
  assert.ok(parts['word/document.xml'], document.name + ' must contain the main Word document');
  assert.ok(parts['docProps/core.xml'], document.name + ' must contain sanitized document properties');
  const coreXml = new TextDecoder().decode(parts['docProps/core.xml']);
  assert.ok(coreXml.includes('<dc:creator>AX.YP</dc:creator>'), document.name + ' must not retain the source author');
  assert.ok(coreXml.includes('<cp:lastModifiedBy>AX.YP</cp:lastModifiedBy>'), document.name + ' must not retain the source Word user');
  assert.doesNotMatch(coreXml, /<dcterms:(?:created|modified)>/u, document.name + ' must not retain original document timestamps');
  const appXml = new TextDecoder().decode(parts['docProps/app.xml']);
  assert.ok(appXml.includes('<Template>AX.YP</Template>'), document.name + ' must not retain original template metadata');
}

const originalFetch = globalThis.fetch;
const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
try {
  globalThis.document = { baseURI: 'https://axyp-gok-test.invalid/' };
  globalThis.window = { AXYP_SERVICE_PROFILE: { get: () => profile } };
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/manifest.json')) {
      return { ok: true, json: async () => ({ schemaVersion: 1, packages: [{ id: 'gok-v1', file: 'gok-v1.axyp.pack.json' }] }) };
    }
    if (url.pathname.endsWith('/gok-v1.axyp.pack.json')) {
      const bytes = new TextEncoder().encode(JSON.stringify(descriptor));
      return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    }
    const chunkName = descriptor.parts.find((part) => url.pathname.endsWith('/' + part));
    if (chunkName) {
      const index = descriptor.parts.indexOf(chunkName);
      return { ok: true, text: async () => chunks[index] };
    }
    return { ok: false };
  };

  const templates = await loadPublishedDossierPackages();
  const gokTemplates = templates.filter((template) => template.category === 'gok');
  assert.equal(gokTemplates.length, 6, 'The published loader must expose all six GOK documents');
  assert.deepEqual(gokTemplates.map((template) => template.name), packed.documents.map((doc) => doc.name));

  const optionalCase = structuredClone(syntheticCase);
  setPath(optionalCase.categoryData, 'gok.case.complainantFullName', '');
  setPath(optionalCase.categoryData, 'gok.policeWitness.religion', '');
  setPath(optionalCase.categoryData, 'gok.service.fax', '');
  setPath(optionalCase.categoryData, 'gok.case.hearingDate', 'TEST-HEARING-DATE');

  for (const template of gokTemplates) {
    assert.deepEqual(getMissingTemplateFields(template, syntheticCase), [], template.name + ' must have all required synthetic fields populated');
    assert.deepEqual(getMissingTemplateFields(template, optionalCase), [], template.name + ' must not require optional category fields');
    const generated = unzipSync(buildDocx(template, optionalCase));
    for (const [name, bytes] of Object.entries(generated)) {
      if (!(name.endsWith('.xml') || name.endsWith('.rels'))) continue;
      const xml = new TextDecoder().decode(bytes);
      assertXmlWellFormed(xml, template.name + ' generated ' + name);
      assert.doesNotMatch(xml, /\{\{\s*[\w.-]+\s*\}\}/u, template.name + ' must not retain unresolved placeholders in ' + name);
      for (const pattern of forbiddenGenerated) {
        assert.doesNotMatch(xml, pattern, template.name + ' generated output must remain free of personal identifiers in ' + name);
        if (name.startsWith('word/')) assert.doesNotMatch(visibleParagraphText(xml), pattern, template.name + ' must not emit identifiers split across Word runs in ' + name);
      }
      const generatedEmails = xml.match(new RegExp(emailPattern.source, 'giu')) || [];
      for (const email of generatedEmails) assert.equal(email, profile.email, template.name + ' may contain only the configured synthetic service email');
    }
    const sourceDocumentPart = packed.documents.find((source) => source.name === template.name).parts['word/document.xml'];
    const sourceDocumentXml = new TextDecoder().decode(sourceDocumentPart.encoding === 'utf8' ? new TextEncoder().encode(sourceDocumentPart.data) : base64ToUint8(sourceDocumentPart.data));
    const generatedDocumentXml = new TextDecoder().decode(generated['word/document.xml']);
    assert.equal(structureSignature(generatedDocumentXml), structureSignature(sourceDocumentXml), template.name + ' must preserve the source paragraph/run/table/formatting structure');
    const generatedApp = new TextDecoder().decode(generated['docProps/app.xml']);
    assert.doesNotMatch(generatedApp, /<TotalTime\b/u, template.name + ' generated metadata must not retain template editing duration');
    const generatedCore = new TextDecoder().decode(generated['docProps/core.xml']);
    assert.ok(generatedCore.includes('<dc:creator>AX.YP</dc:creator>'), template.name + ' generated metadata must use the application author');
    assert.ok(generatedCore.includes('<dc:title>' + template.name.replace(/\.docx$/iu, '') + '</dc:title>'), template.name + ' generated metadata title must remain generic: ' + generatedCore.match(/<dc:title>(.*?)<\/dc:title>/u)?.[1]);
    assert.doesNotMatch(generatedCore, /<(?:dcterms:(?:created|modified)|cp:(?:lastPrinted|revision))\b/u, template.name + ' generated metadata must not retain source timestamps or revisions');
    assert.doesNotMatch(generatedCore, /<dc:(?:subject|description)>[^<]+</u, template.name + ' generated metadata must not retain source-case descriptions');
  }

  const storedCaseSnapshot = structuredClone(optionalCase);
  const oldCaseOutputBefore = new Map(gokTemplates.map((template) => [
    template.name,
    new TextDecoder().decode(unzipSync(buildDocx(template, optionalCase))['word/document.xml'])
  ]));
  const nextCase = structuredClone(optionalCase);
  nextCase.offender.name = 'NEW-CASE-ONLY-NAME';
  nextCase.protocolNumber = 'NEW-CASE-ONLY-PROTOCOL';
  for (const template of gokTemplates) {
    const nextOutput = unzipSync(buildDocx(template, nextCase));
    assert.match(new TextDecoder().decode(nextOutput['word/document.xml']), /NEW-CASE-ONLY-NAME/u, template.name + ' must use the newly selected case data');
  }
  assert.deepEqual(optionalCase, storedCaseSnapshot, 'Generating another case must not mutate the previously saved case object');
  for (const template of gokTemplates) {
    const oldCaseOutputAfter = new TextDecoder().decode(unzipSync(buildDocx(template, optionalCase))['word/document.xml']);
    assert.equal(oldCaseOutputAfter, oldCaseOutputBefore.get(template.name), template.name + ' output for a previously saved case must remain unchanged after generating a new case');
    assert.doesNotMatch(oldCaseOutputAfter, /NEW-CASE-ONLY-(?:NAME|PROTOCOL)/u, template.name + ' must not leak another case into an older saved case');
  }

  const archive = unzipSync(buildCategoryArchive(gokTemplates, syntheticCase));
  const generatedDocx = Object.keys(archive).filter((name) => name.toLowerCase().endsWith('.docx'));
  assert.equal(generatedDocx.length, 6, 'The batch archive must contain exactly six GOK documents');
  assert.ok(generatedDocx.every((name) => !/ΣΤΑΜΑΤ|Φιλιατρ|Καζαντα|2015/u.test(name)), 'Generated filenames must not contain source-case identifiers');
} finally {
  globalThis.fetch = originalFetch;
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
}

console.log('GOK official package tests passed: six documents, accused identity mappings, distinct GOK category, anonymization, schema mappings, and synthetic DOCX/ZIP generation.');
