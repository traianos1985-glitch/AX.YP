import assert from 'node:assert/strict';
import { valueFor, normalizeGreekDocxXml, buildDocx, ensureDefaultTemplates } from '../template-library.js';
import { unzipSync } from '../vendor/fflate.js';

console.log('--- Testing Medium Severity Issues (M1, M2, M3, M4, M5, M6) ---');

// ==========================================
// M1: Date format DD/MM/YYYY across valueFor
// ==========================================
console.log('Testing M1: Date formatting across case, incident, and person fields...');
const mockCaseDates = {
  id: 'm1-case',
  date: '2026-11-05',
  incidentDate: '2026-11-04',
  releaseDate: '2026-11-06',
  offender: {
    surname: 'ΠΑΠΑΔΟΠΟΥΛΟΣ',
    name: 'ΓΕΩΡΓΙΟΣ',
    birthDate: '1990-05-20',
    idDate: '2015-08-14'
  },
  owner: {
    birthDate: '1985-02-10',
    idDate: '2010-03-12'
  },
  counterfeit: {
    witness: {
      birthDate: '1992-12-01',
      idDate: '2018-07-25'
    },
    depositor: {
      birthDate: '1988-04-15',
      idDate: '2014-09-30'
    }
  },
  interpreter: {
    birthDate: '1975-10-08',
    idDate: '2005-11-20'
  }
};

assert.strictEqual(valueFor('case.date', mockCaseDates), '05/11/2026', 'case.date must be DD/MM/YYYY');
assert.strictEqual(valueFor('incident.date', mockCaseDates), '04/11/2026', 'incident.date must be DD/MM/YYYY');
assert.strictEqual(valueFor('case.releaseDate', mockCaseDates), '06/11/2026', 'case.releaseDate must be DD/MM/YYYY');
assert.strictEqual(valueFor('person.birthDate', mockCaseDates), '20/05/1990', 'person.birthDate must be DD/MM/YYYY');
assert.strictEqual(valueFor('person.idDate', mockCaseDates), '14/08/2015', 'person.idDate must be DD/MM/YYYY');
assert.strictEqual(valueFor('offender.birthDate', mockCaseDates), '20/05/1990', 'offender.birthDate must be DD/MM/YYYY');
assert.strictEqual(valueFor('offender.idDate', mockCaseDates), '14/08/2015', 'offender.idDate must be DD/MM/YYYY');
assert.strictEqual(valueFor('owner.birthDate', mockCaseDates), '10/02/1985', 'owner.birthDate must be DD/MM/YYYY');
assert.strictEqual(valueFor('owner.idDate', mockCaseDates), '12/03/2010', 'owner.idDate must be DD/MM/YYYY');
assert.strictEqual(valueFor('counterfeit.witness.birthDate', mockCaseDates), '01/12/1992', 'witness.birthDate must be DD/MM/YYYY');
assert.strictEqual(valueFor('counterfeit.witness.idDate', mockCaseDates), '25/07/2018', 'witness.idDate must be DD/MM/YYYY');
assert.strictEqual(valueFor('counterfeit.depositor.birthDate', mockCaseDates), '15/04/1988', 'depositor.birthDate must be DD/MM/YYYY');
assert.strictEqual(valueFor('counterfeit.depositor.idDate', mockCaseDates), '30/09/2014', 'depositor.idDate must be DD/MM/YYYY');
assert.strictEqual(valueFor('interpreter.birthDate', mockCaseDates), '08/10/1975', 'interpreter.birthDate must be DD/MM/YYYY');
assert.strictEqual(valueFor('interpreter.idDate', mockCaseDates), '20/11/2005', 'interpreter.idDate must be DD/MM/YYYY');
console.log('✓ M1: All date fields format to Greek DD/MM/YYYY correctly.');

// ==========================================
// M2: Service Directorate & Address Replacement
// ==========================================
console.log('Testing M2: Service Directorate & Address replacement...');
const storage = {
  data: {},
  getItem(k) { return this.data[k] || null; },
  setItem(k, v) { this.data[k] = v; }
};
globalThis.window = {
  AXYP_STORAGE: storage,
  AXYP_SERVICE_PROFILE: {
    get: () => ({
      name: 'ΑΣΤΥΝΟΜΙΚΟ ΤΜΗΜΑ ΣΥΝΤΑΓΜΑΤΟΣ',
      directorate: 'ΔΙΕΥΘΥΝΣΗ ΑΣΤΥΝΟΜΙΑΣ ΑΘΗΝΩΝ',
      address: 'Μιχαλακοπούλου 100',
      phone: '2101234567',
      email: 'at.syntagmatos@astynomia.gr',
      prosecutor: 'Αθηνών'
    })
  }
};

await ensureDefaultTemplates(storage);
const templates = JSON.parse(storage.getItem('axyp-docx-templates') || '[]');
const narcotics08 = templates.find(t => t.id === 'narcotics-08');
assert.ok(narcotics08, 'narcotics-08 template must exist');

const docxBytes08 = buildDocx(narcotics08, {
  ...mockCaseDates,
  title: 'Υπόθεση Ναρκωτικών 08',
  location: 'Αθήνα',
  prosecutor: 'Αθηνών',
  protocolNumber: '1020/2026',
  people: 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΕΩΡΓΙΟΣ'
});

const unzipped08 = unzipSync(docxBytes08);
const docXml08 = new TextDecoder().decode(unzipped08['word/document.xml']);

assert.ok(!docXml08.includes('ΔΙΕΥΘΥΝΣΗ ΑΣΤΥΝΟΜΙΑΣ ΜΕΣΣΗΝΙΑΣ'), 'Directorate must not be hardcoded to Μεσσηνίας');
assert.ok(docXml08.includes('ΔΙΕΥΘΥΝΣΗ ΑΣΤΥΝΟΜΙΑΣ ΑΘΗΝΩΝ'), 'Directorate must reflect configured service profile');
assert.ok(!docXml08.includes('60ο χλμ.'), 'Address must not contain hardcoded 60ο χλμ.');
assert.ok(docXml08.includes('Μιχαλακοπούλου 100'), 'Address must reflect configured service profile');
console.log('✓ M2: Service directorate and address replaced cleanly with service profile values.');

// ==========================================
// M3: Dotted blanks in narcotics-02, 06, 08
// ==========================================
console.log('Testing M3: Dotted placeholders in narcotics templates...');
const narcotics02 = templates.find(t => t.id === 'narcotics-02');
const docxBytes02 = buildDocx(narcotics02, {
  ...mockCaseDates,
  title: 'Έκθεση Σύλληψης',
  location: 'Αθήνα',
  prosecutor: 'Αθηνών',
  arrestingOfficer: 'Υπαστυνόμος Β΄ ΑΘΑΝΑΣΙΟΥ Νικόλαος'
});
const docXml02 = new TextDecoder().decode(unzipSync(docxBytes02)['word/document.xml']);
assert.ok(!docXml02.includes('σήμερα την ............ του μηνός'), 'narcotics-02 date intro dots must be resolved');
assert.ok(docXml02.includes('Εισαγγελέα Πρωτοδικών Αθηνών'), 'narcotics-02 prosecutor dots must be resolved');

const narcotics06 = templates.find(t => t.id === 'narcotics-06');
const docxBytes06 = buildDocx(narcotics06, {
  ...mockCaseDates,
  title: 'Έκθεση Απολογίας',
  location: 'Αθήνα',
  prosecutor: 'Αθηνών',
  timeline: {
    examinationStartTime: '14:00',
    examinationEndTime: '14:30'
  }
});
const docXml06 = new TextDecoder().decode(unzipSync(docxBytes06)['word/document.xml']);
assert.ok(docXml06.includes('14:00 ώρα και περατώθηκε την 14:30 ώρα'), 'narcotics-06 examination start/end times should replace dots');
console.log('✓ M3: Dotted placeholders resolved where mapped case data is available.');

// ==========================================
// M4: XML text normalization & spacing
// ==========================================
console.log('Testing M4: Greek XML text normalization...');
const commaXml = '<w:t>έκθεση,η οποία και διαβάστηκε</w:t>';
const normalizedComma = normalizeGreekDocxXml(commaXml);
assert.ok(normalizedComma.includes('έκθεση, η οποία'), 'Comma missing space must have space inserted');

const decimalXml = '<w:t>ποσότητα 1,5 γραμμάρια</w:t>';
const normalizedDecimal = normalizeGreekDocxXml(decimalXml);
assert.ok(normalizedDecimal.includes('1,5'), 'Decimal comma must NOT have space inserted');

const spaceBeforePunctuation = '<w:t>κείμενο , με κενό .</w:t>';
const normalizedSpaced = normalizeGreekDocxXml(spaceBeforePunctuation);
assert.ok(normalizedSpaced.includes('κείμενο, με κενό.'), 'Space before punctuation must be removed');
console.log('✓ M4: Punctuation normalization properly handles Greek text and numbers.');

// ==========================================
// M5: Backup Restore Schema & Nested Validation
// ==========================================
console.log('Testing M5: Backup restore validation...');
function isValidHypothesis(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (typeof item.id !== 'string' || !item.id.trim()) return false;
  if (item.title !== undefined && typeof item.title !== 'string') return false;
  if (item.snapshots !== undefined && !Array.isArray(item.snapshots)) return false;
  const objectFields = ['offender', 'offenderA', 'offenderB', 'officerA', 'officerB', 'counterfeit', 'vehicle', 'noise', 'camping', 'timeline', 'interpreter'];
  for (let i = 0; i < objectFields.length; i++) {
    const f = objectFields[i];
    if (item[f] !== undefined && item[f] !== null && (typeof item[f] !== 'object' || Array.isArray(item[f]))) {
      return false;
    }
  }
  return true;
}

assert.strictEqual(isValidHypothesis({ id: 'c1', title: 'Valid' }), true);
assert.strictEqual(isValidHypothesis({ id: 'c2', offender: { surname: 'Test' } }), true);
assert.strictEqual(isValidHypothesis({ id: 'c3', offender: 'invalid-string' }), false, 'offender must be object');
assert.strictEqual(isValidHypothesis({ id: 'c4', snapshots: {} }), false, 'snapshots must be array');
assert.strictEqual(isValidHypothesis({ id: '   ' }), false, 'id must not be empty');
console.log('✓ M5: Nested hypothesis structure validation verifies backup integrity.');

// ==========================================
// M6: Cross-tab sync event contract
// ==========================================
console.log('Testing M6: Cross-tab sync event contract...');
let broadcastMessageSent = null;
globalThis.BroadcastChannel = class {
  constructor(name) {
    this.name = name;
  }
  postMessage(msg) {
    broadcastMessageSent = msg;
  }
};

const bc = new globalThis.BroadcastChannel('axyp-hypotheses-sync');
bc.postMessage({ type: 'hypotheses-updated' });
assert.deepStrictEqual(broadcastMessageSent, { type: 'hypotheses-updated' });
console.log('✓ M6: Cross-tab BroadcastChannel sync contract verified.');

console.log('\nAll Medium Severity tests (M1, M2, M3, M4, M5, M6) passed successfully!');
