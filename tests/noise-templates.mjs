import assert from 'node:assert/strict';
import { DEFAULT_NOISE_TEMPLATES } from '../noise-templates-data.js';
import { unzipSync } from '../vendor/fflate.js';
import { buildDocx, valueFor } from '../template-library.js';

assert.equal(DEFAULT_NOISE_TEMPLATES.length, 4);
assert.deepEqual(DEFAULT_NOISE_TEMPLATES.map((template) => template.id), ['noise-01', 'noise-02', 'noise-03', 'noise-04']);

const syntheticCase = {
  id: 'synthetic-noise-case',
  title: 'ΔΟΚΙΜΑΣΤΙΚΗ ΥΠΟΘΕΣΗ',
  protocolNumber: 'TEST-PROTOCOL-001',
  offence: 'TEST-OFFENCE',
  status: 'draft',
  date: '2026-11-05',
  time: '10:11',
  incidentDate: '2026-11-04',
  incidentTime: '22:33',
  location: 'TEST-LOCATION',
  prosecutor: 'TEST-PROSECUTOR',
  notes: 'TEST-NOTES',
  profile: 'noise',
  people: 'TEST-PEOPLE',
  evidence: 'TEST-EVIDENCE',
  arrestingOfficer: 'TEST-ARRESTING-OFFICER',
  officerA: {
    rank: 'TEST-OFFICER-RANK',
    surname: 'TEST-OFFICER-SURNAME',
    name: 'TEST-OFFICER-NAME',
    service: 'TEST-OFFICER-SERVICE'
  },
  officerB: {
    rank: 'TEST-OFFICER-B-RANK',
    surname: 'TEST-OFFICER-B-SURNAME',
    name: 'TEST-OFFICER-B-NAME',
    service: 'TEST-OFFICER-B-SERVICE'
  },
  offender: {
    surname: 'TEST-PERSON-SURNAME',
    name: 'TEST-PERSON-NAME',
    fatherName: 'TEST-PERSON-FATHER',
    motherName: 'TEST-PERSON-MOTHER',
    birthDate: 'TEST-PERSON-BIRTH-DATE',
    birthPlace: 'TEST-PERSON-BIRTH-PLACE',
    city: 'TEST-PERSON-CITY',
    address: 'TEST-PERSON-ADDRESS',
    idNumber: 'TEST-PERSON-ID',
    idDate: 'TEST-PERSON-ID-DATE',
    idService: 'TEST-PERSON-ID-SERVICE',
    taxId: 'TEST-PERSON-TAX-ID',
    taxOffice: 'TEST-PERSON-TAX-OFFICE',
    phone: 'TEST-PERSON-PHONE',
    email: 'test-person@example.invalid'
  },
  owner: {
    fullName: 'TEST-OWNER-FULL-NAME',
    fatherName: 'TEST-OWNER-FATHER',
    motherName: 'TEST-OWNER-MOTHER',
    birthDate: 'TEST-OWNER-BIRTH-DATE',
    birthPlace: 'TEST-OWNER-BIRTH-PLACE',
    city: 'TEST-OWNER-CITY',
    idNumber: 'TEST-OWNER-ID',
    idDate: 'TEST-OWNER-ID-DATE',
    idService: 'TEST-OWNER-ID-SERVICE',
    taxId: 'TEST-OWNER-TAX-ID',
    taxOffice: 'TEST-OWNER-TAX-OFFICE'
  },
  noise: {
    description: 'TEST-NOISE-DESCRIPTION',
    establishmentName: 'TEST-ESTABLISHMENT',
    measuredDecibels: 'TEST-MEASURED-DECIBELS',
    limitDecibels: 'TEST-LIMIT-DECIBELS',
    legalProvision: 'TEST-LEGAL-PROVISION',
    regulationNumber: 'TEST-REGULATION-NUMBER'
  },
  timeline: {
    witnessStartTime: '10:11',
    witnessEndTime: '10:16',
    arrestStartTime: '10:17',
    arrestEndTime: '10:22',
    seizureStartTime: '10:23',
    seizureEndTime: '10:28',
    notificationStartTime: '10:29',
    notificationEndTime: '10:34',
    weighingStartTime: '10:35',
    weighingEndTime: '10:40',
    examinationStartTime: '10:41',
    examinationEndTime: '10:46'
  }
};

const escapeXml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;'
})[character]);

for (const template of DEFAULT_NOISE_TEMPLATES) {
  assert.equal(template.category, 'noise', template.id);
  assert.ok(template.dataBase64, template.id);
  assert.ok(template.fields.length > 0, template.id);
  assert.deepEqual(Object.keys(template.mappings).sort(), [...template.fields].sort(), template.id);

  // Every declared field must resolve to a populated case-data path before DOCX generation.
  for (const field of template.fields) {
    const mappedPath = template.mappings[field];
    assert.ok(mappedPath, `${template.id}: missing mapping for ${field}`);
    const mappedValue = valueFor(mappedPath, syntheticCase);
    assert.notEqual(mappedValue, '—', `${template.id}: mapping ${field} -> ${mappedPath} has no test value`);
  }

  // Exercise the exact archive-building function used by the user-facing Word download.
  const generatedBytes = buildDocx(template, syntheticCase);
  assert.ok(generatedBytes instanceof Uint8Array, `${template.id}: generated output must be bytes`);
  assert.ok(generatedBytes.length > 0, `${template.id}: generated output must not be empty`);

  const generatedParts = unzipSync(generatedBytes);
  assert.ok(generatedParts['[Content_Types].xml'], `${template.id}: missing DOCX content types`);
  assert.ok(generatedParts['_rels/.rels'], `${template.id}: missing package relationships`);
  assert.ok(generatedParts['word/document.xml'], `${template.id}: missing main Word document`);

  const wordXmlEntries = Object.keys(generatedParts).filter((path) =>
    path.startsWith('word/') && path.endsWith('.xml')
  );
  assert.ok(wordXmlEntries.includes('word/document.xml'), `${template.id}: main document not checked`);

  const combinedXml = wordXmlEntries
    .map((path) => new TextDecoder().decode(generatedParts[path]))
    .join('\n');

  // No template placeholder may survive in any Word XML part (document, headers, footers, etc.).
  assert.doesNotMatch(combinedXml, /\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/, `${template.id}: unresolved placeholder`);

  // Check that each field's distinctive synthetic value reached the generated DOCX XML.
  for (const field of template.fields) {
    const mappedValue = valueFor(template.mappings[field], syntheticCase);
    assert.ok(
      combinedXml.includes(escapeXml(mappedValue)),
      `${template.id}: generated DOCX does not contain the mapped value for ${field}`
    );
  }
}

assert.throws(() => buildDocx(null, syntheticCase), /Template and case data are required/);
assert.throws(() => buildDocx(DEFAULT_NOISE_TEMPLATES[0], null), /Template and case data are required/);

console.log('Noise dossier DOCX generation regression tests passed for all four templates.');
