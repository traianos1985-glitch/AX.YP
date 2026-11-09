import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzlibSync, strFromU8, strToU8 } from '../vendor/fflate.js';
import { base64ToUint8 } from '../template-library.js';
import { buildDocx, getMissingTemplateFields } from '../template-library.js';

const catalog = JSON.parse(await readFile(new URL('../dossier-packages/manifest.json', import.meta.url), 'utf8'));
const entry = catalog.packages.find((item) => item.id === 'narcotics-v2');
assert.ok(entry, 'The current narcotics package must be published in the static catalog');
assert.equal(entry.file, 'narcotics-v2.axyp.pack.json');

const descriptor = JSON.parse(await readFile(new URL('../dossier-packages/' + entry.file, import.meta.url), 'utf8'));
assert.equal(descriptor.encoding, 'base64-chunks');
const encodedParts = await Promise.all(descriptor.parts.map((part) => readFile(new URL('../dossier-packages/' + part, import.meta.url), 'utf8')));
const packageBytes = base64ToUint8(encodedParts.join(''));
assert.equal(packageBytes.length, descriptor.byteLength);
const manifest = JSON.parse(strFromU8(unzlibSync(packageBytes)));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.category, 'narcotics');
assert.equal(manifest.documents.length, 9, 'The current phase contains the nine non-submission documents');
assert.doesNotMatch(manifest.documents.map((doc) => doc.name).join(' '), /ΥΠΟΒΟΛΗ|SUBMISSION/iu, 'Dossier submission documents remain deferred to phase two');

const expectedNames = [
  '01_ΚΑΤΑΘΕΣΗ_ΜΑΡΤΥΡΑ.docx',
  '02_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ.docx',
  '03_ΕΚΘΕΣΗ_ΠΑΡΑΔΟΣΕΩΣ_ΚΑΙ_ΚΑΤΑΣΧΕΣΕΩΣ_ΝΑΡΚΩΤΙΚΩΝ.docx',
  '04_ΕΚΘΕΣΗ_ΖΥΓΙΣΗΣ_ΝΑΡΚΩΤΙΚΩΝ_ΟΥΣΙΩΝ.docx',
  '05_ΕΚΘΕΣΗ_ΓΝΩΣΤΟΠΟΙΗΣΗΣ_ΝΑΡΚΩΤΙΚΩΝ_ΟΥΣΙΩΝ.docx',
  '06_ΕΚΘΕΣΗ_ΕΞΕΤΑΣΗΣ_ΚΑΤΗΓΟΡΟΥΜΕΝΟΥ.docx',
  '07_ΔΕΛΤΙΟ_ΣΤΟΙΧΕΙΩΝ_ΤΑΥΤΟΤΗΤΑΣ_ΚΑΤΗΓΟΡΟΥΜΕΝΟΥ.docx',
  '10_ΑΠΟΣΤΟΛΗ_ΔΕΙΓΜΑΤΟΣ_ΣΤΟ_ΧΗΜΕΙΟ.docx',
  '11_ΒΑΣ.docx'
];
assert.deepEqual(manifest.documents.map((doc) => doc.name), expectedNames, 'Document order and names must match the reviewed source ZIP');

const sensitivePatterns = [
  /\\b[A-ZΑ-Ω]{1,2}\\d{7,8}\\b/u,
  /\\b69\\d{8}\\b/u,
  /[\\w.+-]+@[\\w.-]+\\.[A-Z]{2,}/iu,
  /\\b\\d{9}\\b/u
];
const serviceProfile = {
  name: 'TEST-SERVICE',
  directorate: 'TEST-DIRECTORATE',
  address: 'TEST-SERVICE-ADDRESS',
  phone: 'TEST-SERVICE-PHONE',
  email: 'test-service@example.invalid',
  chemicalService: 'TEST-CHEMICAL-SERVICE',
  location: 'TEST-SERVICE-CITY'
};
globalThis.window = { AXYP_SERVICE_PROFILE: { get: () => serviceProfile } };

const syntheticCase = {
  id: 'narcotics-package-test',
  profile: 'narcotics',
  title: 'TEST-NARCOTICS-CASE',
  protocolNumber: 'TEST-PROTOCOL-001',
  prosecutor: 'TEST-PROSECUTOR-ORGANIZATION',
  date: '2026-11-09',
  time: '10:00',
  location: 'TEST-CASE-LOCATION',
  incident: { date: '2026-11-09', time: '10:15', location: 'TEST-INCIDENT-LOCATION' },
  offender: {
    surname: 'TEST-SURNAME', name: 'TEST-NAME', fatherName: 'TEST-FATHER', motherName: 'TEST-MOTHER',
    birthDate: '1990-01-02', birthPlace: 'TEST-BIRTH-PLACE', city: 'TEST-CITY', address: 'TEST-ADDRESS',
    idNumber: 'TEST-ID', idDate: '2015-01-02', idService: 'TEST-ID-SERVICE',
    taxId: 'TEST-TAX', taxOffice: 'TEST-TAX-OFFICE', phone: 'TEST-PHONE', email: 'test-person@example.invalid',
    profession: 'TEST-PROFESSION', education: 'TEST-EDUCATION', maritalStatus: 'TEST-MARITAL', children: 'TEST-CHILDREN'
  },
  officerA: { rank: 'TEST-RANK-A', surname: 'TEST-SURNAME-A', name: 'TEST-NAME-A', fullName: 'TEST-A-FULL', documentFullName: 'TEST-A-GENITIVE', service: 'TEST-SERVICE' },
  officerB: { rank: 'TEST-RANK-B', surname: 'TEST-SURNAME-B', name: 'TEST-NAME-B', documentFullName: 'TEST-B-GENITIVE', service: 'TEST-SERVICE-B' },
  timeline: {
    witnessStartTime: '10:20', witnessEndTime: '10:35',
    arrestStartTime: '10:35', arrestEndTime: '10:50',
    seizureStartTime: '10:50', weighingStartTime: '11:05',
    notificationStartTime: '11:20', examinationStartTime: '11:25'
  },
  categoryData: {
    narcotics: {
      policeWitness: {
        fullName: 'TEST-WITNESS', fatherNameGenitive: 'TEST-WITNESS-FATHER', motherNameGenitive: 'TEST-WITNESS-MOTHER',
        birthDate: '1985-02-03', birthPlace: 'TEST-WITNESS-BIRTH', idNumber: 'TEST-WITNESS-ID', idYear: '2020',
        profession: 'TEST-WITNESS-PROFESSION', rank: 'TEST-WITNESS-RANK',
        dutyStartTime: '06:00', dutyEndTime: '14:00', patrolOtherService: 'TEST-OTHER-SERVICE'
      },
      apprehendingOfficer: {
        rank: 'TEST-APPREHENDING-RANK', fullName: 'TEST-APPREHENDING-OFFICER',
        fatherNameGenitive: 'TEST-APPREHENDING-FATHER', motherNameGenitive: 'TEST-APPREHENDING-MOTHER',
        birthDate: '1975-06-18', birthPlace: 'TEST-APPREHENDING-BIRTH', city: 'TEST-APPREHENDING-CITY',
        education: 'TEST-APPREHENDING-EDUCATION', profession: 'TEST-APPREHENDING-PROFESSION',
        idNumber: 'TEST-APPREHENDING-ID', idDate: '2020-03-28', idService: 'TEST-APPREHENDING-ID-SERVICE',
        service: 'TEST-APPREHENDING-SERVICE'
      },
      offender: {
        fullNameAccusative: 'TEST-ACCUSED-ACCUSATIVE', fullNameGenitive: 'TEST-ACCUSED-GENITIVE',
        fatherNameGenitive: 'TEST-ACCUSED-FATHER-GENITIVE', motherNameGenitive: 'TEST-ACCUSED-MOTHER-GENITIVE',
        previousHistory: 'TEST-PREVIOUS-HISTORY', rightsResponse: 'TEST-RIGHTS-RESPONSE', statement: 'TEST-ACCUSED-STATEMENT'
      },
      exhibits: { cannabis: { quantity: '2.96' }, cigarette: { quantity: '1' } },
      policeUnit: 'TEST-POLICE-UNIT',
      case: { noticeResponse: 'TEST-NOTICE-RESPONSE', releaseTime: '19:30', chemicalProtocolNumber: 'TEST-CHEMICAL-PROTOCOL' },
      prosecutor: { surname: 'TEST-PROSECUTOR-SURNAME' },
      service: {
        commanderFullName: 'TEST-COMMANDER', postalCode: 'TEST-POSTAL',
        chemicalServiceCity: 'TEST-CHEMICAL-CITY', chemicalServicePostalCode: 'TEST-CHEMICAL-POSTAL'
      }
    }
  }
};

for (const document of manifest.documents) {
  assert.ok(document.parts && typeof document.parts === 'object', document.path + ' must contain its DOCX parts');
  const docxParts = Object.fromEntries(Object.entries(document.parts).map(([name, part]) => [
    name,
    part.encoding === 'utf8' ? strToU8(part.data) : base64ToUint8(part.data)
  ]));
  assert.ok(docxParts['word/document.xml'], document.name + ' must be a valid DOCX');
  const sourceXml = Object.entries(docxParts).filter(([name]) => name.startsWith('word/') && (name.endsWith('.xml') || name.endsWith('.rels')));
  const sourceText = sourceXml.map(([, bytes]) => new TextDecoder().decode(bytes)).join('\n');
  const placeholders = [...sourceText.matchAll(/\{\{\s*([\p{L}\p{N}_.-]+)\s*\}\}/gu)].map((match) => match[1]);
  for (const field of placeholders) {
    assert.ok(document.fields.includes(field), document.name + ' must declare ' + field);
    assert.equal(document.mappings[field], field, document.name + ' must map ' + field + ' to its canonical field path');
  }
  for (const pattern of sensitivePatterns) assert.doesNotMatch(sourceText, pattern, document.name + ' must not contain recognizable personal identifiers');

  const template = {
    ...document,
    category: 'narcotics',
    source: 'published-package',
    files: Object.fromEntries(Object.entries(docxParts).map(([name, bytes]) => [name, Array.from(bytes)]))
  };
  assert.deepEqual(getMissingTemplateFields(template, syntheticCase), [], document.name + ' must have every mapped field populated by the synthetic case');
  const generated = unzipSync(buildDocx(template, syntheticCase));
  for (const [name, bytes] of Object.entries(generated)) {
    if (!name.startsWith('word/') || !(name.endsWith('.xml') || name.endsWith('.rels'))) continue;
    const xml = new TextDecoder().decode(bytes);
    assert.doesNotMatch(xml, /\{\{\s*[\p{L}\p{N}_.-]+\s*\}\}/u, document.name + ' must not retain unresolved placeholders in ' + name);
    for (const pattern of sensitivePatterns) assert.doesNotMatch(xml, pattern, document.name + ' generated output must not contain recognizable personal identifiers');
  }
}

assert.ok(manifest.documents.some((doc) => doc.fields.includes('narcotics.exhibits.cannabis.quantity')));
assert.ok(manifest.documents.some((doc) => doc.fields.includes('narcotics.exhibits.cigarette.quantity')));
console.log('Narcotics official package tests passed: nine source templates, privacy scan, independent exhibit units, and populated DOCX generation.');
