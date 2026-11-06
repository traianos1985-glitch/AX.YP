import assert from 'node:assert/strict';
import { buildDocx, ensureDefaultTemplates } from '../template-library.js';
import { unzipSync } from '../vendor/fflate.js';

// Use an isolated in-memory store so the test exercises the same seeded
// built-in templates as a fresh installation without touching browser data.
const values = new Map();
const mockStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); }
};

ensureDefaultTemplates(mockStorage);
const templates = JSON.parse(mockStorage.getItem('axyp-docx-templates') || '[]');
const expectedCounts = {
  narcotics: 10,
  counterfeit: 5,
  environment: 4,
  health: 4,
  noise: 4,
  camping: 4,
  commerce: 8
};

for (const [category, expected] of Object.entries(expectedCounts)) {
  assert.equal(
    templates.filter((template) => template.category === category).length,
    expected,
    `All ${expected} built-in ${category} templates must be seeded`
  );
}

const syntheticCase = {
  id: 'all-dossier-docx-regression',
  profile: 'noise',
  title: 'TEST-CASE-TITLE',
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
  people: 'TEST-PEOPLE',
  evidence: 'TEST-EVIDENCE',
  arrestingOfficer: 'TEST-ARRESTING-OFFICER',
  officerA: { rank: 'TEST-RANK-A', surname: 'TEST-SURNAME-A', name: 'TEST-NAME-A', service: 'TEST-SERVICE-A' },
  officerB: { rank: 'TEST-RANK-B', surname: 'TEST-SURNAME-B', name: 'TEST-NAME-B', service: 'TEST-SERVICE-B' },
  offender: {
    surname: 'TEST-PERSON-SURNAME', name: 'TEST-PERSON-NAME',
    fatherName: 'TEST-FATHER', motherName: 'TEST-MOTHER',
    birthDate: '1990-01-01', birthPlace: 'TEST-BIRTH-PLACE',
    city: 'TEST-CITY', address: 'TEST-ADDRESS', idNumber: 'TEST-ID',
    idDate: '2015-05-10', idService: 'TEST-ID-SERVICE',
    taxId: 'TEST-TAX-ID', taxOffice: 'TEST-TAX-OFFICE',
    phone: 'TEST-PHONE', email: 'test@example.invalid'
  },
  offenderA: { fullName: 'TEST-ACTOR-A', idNumber: 'TEST-ACTOR-A-ID', address: 'TEST-ACTOR-A-ADDRESS' },
  offenderB: { fullName: 'TEST-ACTOR-B', idNumber: 'TEST-ACTOR-B-ID', address: 'TEST-ACTOR-B-ADDRESS' },
  counterfeit: {
    serialNumber: 'TEST-SERIAL-001',
    witness: { surname: 'TEST-WITNESS-SURNAME', name: 'TEST-WITNESS-NAME', fatherName: 'TEST-WITNESS-FATHER', motherName: 'TEST-WITNESS-MOTHER', birthDate: '1991-01-01', birthPlace: 'TEST-WITNESS-BIRTH', city: 'TEST-WITNESS-CITY', address: 'TEST-WITNESS-ADDRESS', idNumber: 'TEST-WITNESS-ID', idDate: '2016-01-01', idService: 'TEST-WITNESS-SERVICE', email: 'witness@example.invalid' },
    depositor: { surname: 'TEST-DEPOSITOR-SURNAME', name: 'TEST-DEPOSITOR-NAME', fatherName: 'TEST-DEPOSITOR-FATHER', motherName: 'TEST-DEPOSITOR-MOTHER', birthDate: '1992-01-01', birthPlace: 'TEST-DEPOSITOR-BIRTH', city: 'TEST-DEPOSITOR-CITY', address: 'TEST-DEPOSITOR-ADDRESS', idNumber: 'TEST-DEPOSITOR-ID', idDate: '2017-01-01', idService: 'TEST-DEPOSITOR-SERVICE', taxId: 'TEST-DEPOSITOR-TAX', phone: 'TEST-DEPOSITOR-PHONE', email: 'depositor@example.invalid' }
  },
  environment: { description: 'TEST-ENVIRONMENT-DESCRIPTION' },
  health: { description: 'TEST-HEALTH-DESCRIPTION' },
  noise: {
    description: 'TEST & <NOISE> "DESCRIPTION"',
    establishmentName: 'TEST-ESTABLISHMENT',
    measuredDecibels: 'TEST-MEASURED-DB',
    limitDecibels: 'TEST-LIMIT-DB',
    legalProvision: 'TEST-LEGAL-PROVISION',
    regulationNumber: 'TEST-REGULATION-NUMBER'
  },
  owner: {
    fullName: 'TEST-OWNER-NAME', fatherName: 'TEST-OWNER-FATHER',
    motherName: 'TEST-OWNER-MOTHER', birthDate: '1980-01-01',
    birthPlace: 'TEST-OWNER-BIRTH', city: 'TEST-OWNER-CITY',
    idNumber: 'TEST-OWNER-ID', idDate: '2010-01-01',
    idService: 'TEST-OWNER-ID-SERVICE', taxId: 'TEST-OWNER-TAX',
    taxOffice: 'TEST-OWNER-TAX-OFFICE'
  },
  timeline: {
    witnessStartTime: '10:00', witnessEndTime: '10:05',
    arrestStartTime: '10:06', arrestEndTime: '10:11',
    seizureStartTime: '10:12', seizureEndTime: '10:17',
    notificationStartTime: '10:18', notificationEndTime: '10:23',
    weighingStartTime: '10:24', weighingEndTime: '10:29',
    examinationStartTime: '10:30', examinationEndTime: '10:35'
  }
};

let generated = 0;
for (const template of templates) {
  const docx = buildDocx(template, syntheticCase);
  assert.ok(docx instanceof Uint8Array, `${template.id} must produce DOCX bytes`);
  assert.ok(docx.length > 1000, `${template.id} must produce a non-empty DOCX package`);

  const reopened = unzipSync(docx);
  assert.ok(reopened['[Content_Types].xml'], `${template.id} must include DOCX content types`);
  assert.ok(reopened['_rels/.rels'], `${template.id} must include package relationships`);
  assert.ok(reopened['word/document.xml'], `${template.id} must include the main Word document`);

  const wordXml = Object.entries(reopened)
    .filter(([name]) => name.startsWith('word/') && name.endsWith('.xml'));
  assert.ok(wordXml.length > 0, `${template.id} must contain Word XML parts`);

  for (const [filename, bytes] of wordXml) {
    const xml = new TextDecoder().decode(bytes);
    assert.doesNotMatch(
      xml,
      /\{\{\s*[\p{L}\p{N}_.-]+\s*\}\}/u,
      `${template.id} (${filename}) must not retain unresolved placeholders`
    );
  }
  generated += 1;
}

const noiseTemplate = templates.find((template) => template.id === 'noise-01');
assert.ok(noiseTemplate, 'Noise template must be present in the seeded library');
const noiseDocx = unzipSync(buildDocx(noiseTemplate, syntheticCase));
const noiseXml = new TextDecoder().decode(noiseDocx['word/document.xml']);
assert.ok(noiseXml.includes('TEST &amp; &lt;NOISE&gt; &quot;DESCRIPTION&quot;'), 'User-entered text must be XML-escaped in generated Word content');

const campingCase = {
  ...syntheticCase,
  profile: 'camping',
  offender: { ...syntheticCase.offender, postalCode: 'TEST-POSTAL', nationality: 'TEST-NATIONALITY' },
  camping: { legalProvision: 'TEST-CAMPING-LAW', location: 'TEST-CAMPING-LOCATION', actDescription: 'TEST-CAMPING-ACT', actQualifier: 'TEST-CAMPING-QUALIFIER', outdoorItems: 'TEST-OUTDOOR-ITEMS', noDesignatedSite: 'TEST-NO-DESIGNATED-SITE' },
  vehicle: { type: 'TEST-VEHICLE-TYPE', registration: 'TEST-REGISTRATION', towVehicleRegistration: 'TEST-TOW-REG', caravanRegistration: 'TEST-CARAVAN-REG' },
  interpreter: { fullName: 'TEST-INTERPRETER-NAME', language: 'TEST-INTERPRETER-LANGUAGE', fatherName: 'TEST-INTERPRETER-FATHER', motherName: 'TEST-INTERPRETER-MOTHER', birthDate: '1985-02-03', birthPlace: 'TEST-INTERPRETER-BIRTH', city: 'TEST-INTERPRETER-CITY', idNumber: 'TEST-INTERPRETER-ID', idDate: '2010-04-05', idService: 'TEST-INTERPRETER-SERVICE', nationality: 'TEST-INTERPRETER-NATIONALITY' },
  prosecutorPerson: { fullName: 'TEST-PROSECUTOR-NAME', title: 'TEST-PROSECUTOR-TITLE' }
};
for (const template of templates.filter((entry) => entry.category === 'camping')) {
  const parts = unzipSync(buildDocx(template, campingCase));
  const xml = new TextDecoder().decode(parts['word/document.xml']);
  for (const marker of ['TEST-CAMPING-LOCATION', 'TEST-PERSON-SURNAME']) {
    if (template.id !== 'camping-03') assert.ok(xml.includes(marker), `${template.id} must map ${marker}`);
  }
  if (template.id === 'camping-01') {
    for (const marker of ['TEST-INTERPRETER-FATHER', 'TEST-INTERPRETER-NATIONALITY', 'TEST-INTERPRETER-ID', 'TEST-INTERPRETER-LANGUAGE']) {
      assert.ok(xml.includes(marker), `camping-01 must map ${marker}`);
    }
  }
  if (template.id === 'camping-02') {
    assert.ok(xml.includes('TEST-PROSECUTOR-NAME'));
    assert.ok(xml.includes('TEST-PROSECUTOR-TITLE'));
    assert.ok(xml.includes('TEST-POSTAL'));
    assert.ok(xml.includes('TEST-NATIONALITY'));
  }
}
assert.equal(generated, 39, 'All built-in dossier templates must use the production DOCX generation path');
console.log(`Production DOCX generation regression passed for all ${generated} built-in templates.`);
