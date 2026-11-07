import assert from 'node:assert/strict';
import { buildDocx, ensureDefaultTemplates, DOCX_TEMPLATE_VERSION } from '../template-library.js';
import { unzipSync } from '../vendor/fflate.js';

globalThis.window = {
  AXYP_SERVICE_PROFILE: {
    get: () => ({
      name: 'TEST-SERVICE-NAME',
      operator: 'TEST-Rank TEST-SURNAME-A TEST-NAME-A',
      operatorDocument: 'TEST-OFFICER-A-GENITIVE',
      address: 'TEST-SERVICE-ADDRESS',
      phone: 'TEST-SERVICE-PHONE',
      email: 'test-service@example.invalid',
      prosecutor: 'TEST-PROSECUTOR',
      chemicalService: 'TEST-CHEMICAL-SERVICE'
    })
  }
};

// Use an isolated in-memory store so the test exercises the same seeded
// built-in templates as a fresh installation without touching browser data.
const values = new Map();
const mockStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); }
};

await ensureDefaultTemplates(mockStorage);
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
    establishmentName: 'TEST & <NOISE> "DESCRIPTION"',
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

  const footerEntries = Object.entries(reopened).filter(([name]) => /^word\/footer\d+\.xml$/u.test(name));
  assert.ok(footerEntries.length > 0, `${template.id} must include a real Word footer part`);
  const footerText = footerEntries.map(([, bytes]) => new TextDecoder().decode(bytes)).join(' ');
  assert.ok(footerText.includes('AX.YP'), `${template.id} footer must identify AX.YP`);
  assert.ok(footerText.includes(template.id), `${template.id} footer must identify the source template`);
  assert.ok(footerText.includes(DOCX_TEMPLATE_VERSION), `${template.id} footer must include the template release version`);
  const documentRels = new TextDecoder().decode(reopened['word/_rels/document.xml.rels']);
  assert.match(documentRels, /relationships\/footer/u, `${template.id} must link its footer through document relationships`);
  assert.match(new TextDecoder().decode(reopened['word/document.xml']), /<w:footerReference\b[^>]*w:type="default"/u, `${template.id} must attach the footer to the document section`);
  assert.match(new TextDecoder().decode(reopened['[Content_Types].xml']), /footer\+xml/u, `${template.id} must register the footer content type`);

  const wordXml = Object.entries(reopened)
    .filter(([name]) => name.startsWith('word/') && name.endsWith('.xml'));
  assert.ok(wordXml.length > 0, `${template.id} must contain Word XML parts`);

  const combinedXml = wordXml
    .map(([filename, bytes]) => {
      const xml = new TextDecoder().decode(bytes);
      assert.doesNotMatch(
        xml,
        /\{\{\s*[\p{L}\p{N}_.-]+\s*\}\}/u,
        `${template.id} (${filename}) must not retain unresolved placeholders`
      );
      return xml;
    })
    .join('\n');

  assert.doesNotMatch(
    combinedXml,
    /Α\.Τ\.\s*Τριφυλίας|Αστυνομικό Τμήμα Τριφυλίας|Αστυνομικού Τμήματος Τριφυλίας/u,
    `${template.id} must not hardcode the issuing Triphylia police service in generated text`
  );
  assert.doesNotMatch(
    combinedXml,
    /Στην Κυπαρισσία σήμερα την 16η του μήνα Απριλίου του έτους 2021|Στην Κυπαρισσία σήμερα την 21 του μηνός Απριλίου του έτους 2022|Κυπαρισσία,\s*(?:01 Απριλίου 2021|31 Μαρτίου 2021|21\s+Απριλίου 2022)|ώρα της 21\/4\/2022|\(21\/4\/2022\)/u,
    `${template.id} must not retain a fixed legacy case date`
  );
  if (/^(camping-0[1-4]|noise-0[1-3])$/.test(template.id)) {
    assert.ok(combinedXml.includes('TEST-LOCATION'), `${template.id} must use the current case location`);
    assert.ok(combinedXml.includes('Νοεμβρίου') && combinedXml.includes('2026'), `${template.id} must use the current Greek case date`);
  }
  generated += 1;
}

function generatedText(templateId) {
  const template = templates.find((entry) => entry.id === templateId);
  assert.ok(template, `Missing ${templateId}`);
  const parts = unzipSync(buildDocx(template, syntheticCase));
  return {
    parts,
    text: Object.entries(parts)
      .filter(([name]) => name.startsWith('word/') && name.endsWith('.xml'))
      .map(([, bytes]) => new TextDecoder().decode(bytes))
      .join('\\n')
  };
}

const narcotics02 = generatedText('narcotics-02');
assert.ok(narcotics02.text.includes('TEST-SERVICE-B'), 'narcotics-02 must use investigator B service');
assert.ok(!narcotics02.text.includes('κάτοικων Α.Τ. Τριφυλίας'), 'narcotics-02 must not retain the fixed investigator-B service');
assert.equal((narcotics02.text.match(/<w:tbl>/g) || []).length > 0, true, 'narcotics-02 signatures must use a real Word table');
assert.ok(narcotics02.text.includes('Ο Β΄ Ανακριτικός Υπάλληλος'), 'narcotics-02 table must label investigator B');
assert.ok(narcotics02.text.includes('TEST-ARRESTING-OFFICER'), 'narcotics-02 signature table must populate the arresting officer');
assert.ok(narcotics02.text.includes('TEST-Rank TEST-SURNAME-A TEST-NAME-A'), 'narcotics-02 signature table must populate investigator A full name');
assert.ok(narcotics02.text.includes('TEST-RANK-B TEST-SURNAME-B TEST-NAME-B'), 'narcotics-02 signature table must populate investigator B full name');
assert.ok(narcotics02.text.includes('TEST-SERVICE-B'), 'narcotics-02 must populate investigator B service in the generated document');

const narcotics10 = generatedText('narcotics-10');
assert.ok(narcotics10.text.includes('TEST-Rank TEST-SURNAME-A TEST-NAME-A'), 'narcotics-10 D-33 must populate the responsible officer in the rights notice');
assert.equal(
  (narcotics10.text.match(/TEST-Rank TEST-SURNAME-A TEST-NAME-A/g) || []).length,
  2,
  'narcotics-10 must populate the officer in both the responsible-officer notice and the final officer declaration'
);
assert.ok(narcotics10.text.includes('ΑΠΟΔΕΙΚΤΙΚΟ ΚΟΙΝΟΠΟΙΗΣΗΣ'), 'narcotics-10 must retain the official proof-of-notification section');
assert.ok(narcotics10.text.includes('Ημερομηνία') && narcotics10.text.includes('Ώρα'), 'narcotics-10 must retain the notification date and time fields');
assert.ok(narcotics10.text.includes('…………'), 'narcotics-10 notification date/time must remain manually fillable; case creation time is not necessarily the actual time rights were communicated');
assert.ok(narcotics10.text.includes('TEST-SERVICE-NAME'), 'narcotics-10 must populate the issuing-service header from the per-installation service profile');
assert.ok(!/Τριφυλ|Κυπαρισσ/iu.test(narcotics10.text), 'narcotics-10 must not retain installation-specific service names');

const narcotics08 = generatedText('narcotics-08');
assert.ok(narcotics08.text.includes('TEST-PROSECUTOR'), 'narcotics-08 must populate the prosecutor recipient from the case');
assert.ok(!/Εισαγγελία Πρωτοδικών\\s*\\.{5,}/u.test(narcotics08.text), 'narcotics-08 must not retain a dotted prosecutor placeholder');

const narcotics09 = generatedText('narcotics-09');
assert.ok(narcotics09.text.includes('Πάρκο Λιμενικού, Τ.Κ. 24131, Καλαμάτα'), 'narcotics-09 must show the verified Chemical Service address and postal code');
assert.ok(!narcotics09.text.includes('Τ.Κ. 241 00'), 'narcotics-09 must not retain the obsolete postal code');

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
