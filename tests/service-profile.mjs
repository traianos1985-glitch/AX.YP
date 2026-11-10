import assert from 'node:assert/strict';
import { readServiceProfile, writeServiceProfile, SERVICE_PROFILE_FIELDS, SERVICE_PROFILE_STORAGE_KEY, getServiceProfileBackupValue, getServiceProfileRestoreEntry, toGreekGenitiveFullName, getServiceProfileOperatorIdentity } from '../service-profile.js';

assert.equal(SERVICE_PROFILE_STORAGE_KEY, 'axyp-service-profile-v1');
assert.equal(toGreekGenitiveFullName("Υπαστυνόμος Β' ΔΟΚΙΜΗΣ Αλέξανδρος"), "Υπαστυνόμου Β' ΓΙΟΥΡΟΥΚΗ Τραϊανού");
assert.equal(toGreekGenitiveFullName('Αρχιφύλακας ΔΟΚΙΜΗΣ Γεώργιος'), 'Αρχιφύλακα ΒΟΥΤΥΡΙΤΣΑ Γεώργιου');
assert.deepEqual(getServiceProfileOperatorIdentity({ operator: "Υπαστυνόμος Β' ΔΟΚΙΜΗΣ Αλέξανδρος", name: 'Αστυνομικό Τμήμα Δοκιμής' }), { fullName: "Υπαστυνόμος Β' ΔΟΚΙΜΗΣ Αλέξανδρος", documentFullName: "Υπαστυνόμου Β' ΓΙΟΥΡΟΥΚΗ Τραϊανού", rank: "Υπαστυνόμος Β'", surname: 'ΔΟΚΙΜΗΣ', name: 'Αλέξανδρος', service: 'Αστυνομικό Τμήμα Δοκιμής', residence: 'Αστυνομικό Τμήμα Δοκιμής' });
const values = new Map();
const storage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); }
};
const empty = readServiceProfile(storage);
assert.deepEqual(Object.keys(empty), [...SERVICE_PROFILE_FIELDS]);
assert.equal(empty.name, '');
assert.equal(empty.location, '');
assert.equal(empty.operator, '');
assert.equal(empty.operatorDocument, '');
assert.equal(empty.secondOfficer, '');
assert.equal(empty.secondOfficerDocument, '');
assert.ok(Object.values(empty).every((value) => value === ''), 'A fresh installation must not inherit another service or officer identity');
assert.equal(getServiceProfileBackupValue(storage), JSON.stringify(empty), 'An empty profile must also be backed up to prevent stale cross-installation values');

const saved = writeServiceProfile(storage, {
  name: 'Αστυνομικό Τμήμα Δοκιμής',
  address: 'Οδός Δοκιμής 1',
  phone: '2100000000',
  email: 'test@example.invalid',
  prosecutor: 'Εισαγγελία Πρωτοδικών Δοκιμής',
  chemicalService: 'Χημική Υπηρεσία Δοκιμής',
  location: 'Δοκιμαστική πόλη',
  operator: 'Υπαστυνόμος Β΄ ΔΟΚΙΜΗΣ Αλέξανδρος',
  operatorDocument: 'Υπαστυνόμου Β΄ ΔΟΚΙΜΗΣ Αλεξάνδρου',
  secondOfficer: 'Αρχιφύλακας ΔΟΚΙΜΗΣ Γεώργιος',
  secondOfficerDocument: 'Αρχιφύλακα ΔΟΚΙΜΗΣ Γεώργιου',
  ignored: 'must not be persisted'
});
assert.equal(saved.name, 'Αστυνομικό Τμήμα Δοκιμής');
assert.equal(saved.chemicalService, 'Χημική Υπηρεσία Δοκιμής');
assert.equal(saved.operator, 'Υπαστυνόμος Β΄ ΔΟΚΙΜΗΣ Αλέξανδρος');
const exactOperator = writeServiceProfile(storage, { operator: '  Υ/Β΄ ΔΟΚΙΜΗΣ Αλέξανδρος  ' });
assert.equal(exactOperator.operator, '  Υ/Β΄ ΔΟΚΙΜΗΣ Αλέξανδρος  ', 'Operator display text must be preserved verbatim');
writeServiceProfile(storage, saved);
assert.ok(!Object.hasOwn(saved, 'ignored'));
assert.deepEqual(readServiceProfile(storage), saved);
assert.equal(getServiceProfileBackupValue(storage), JSON.stringify(saved));
const restoredEntry = getServiceProfileRestoreEntry({ serviceProfile: JSON.stringify(saved) });
assert.deepEqual(restoredEntry, [SERVICE_PROFILE_STORAGE_KEY, JSON.stringify(saved)]);
assert.equal(getServiceProfileRestoreEntry({ schema: 2 }), null);
assert.throws(() => getServiceProfileRestoreEntry({ serviceProfile: '{invalid' }), /έγκυρο JSON/u);
assert.throws(() => getServiceProfileRestoreEntry({ serviceProfile: JSON.stringify({ name: { unexpected: true } }) }), /μη έγκυρη μορφή/u);


globalThis.window = { AXYP_SERVICE_PROFILE: { get: () => saved } };
const { valueFor, replaceLegacyFixedDateText } = await import('../template-library.js');
assert.equal(valueFor('service.name', { title: 'CASE-ONLY-DATA' }), 'Αστυνομικό Τμήμα Δοκιμής');
assert.equal(valueFor('case.location', { title: 'CASE-ONLY-DATA' }), 'Δοκιμαστική πόλη');
assert.match(valueFor('case.date', { title: 'CASE-ONLY-DATA' }), /^\d{2}\/\d{2}\/\d{4}$/u);
assert.equal(valueFor('case.date.weekdayName', { date: '2026-11-07' }), 'Σάββατο');
const legacyDateXml = replaceLegacyFixedDateText(
  'Στην Δοκιμαστική πόλη σήμερα την 01 του μηνός Ιανουαρίου του έτους 2000 ημέρα της εβδομάδος Σάββατο',
  { title: 'LEGACY-CASE-WITHOUT-DATE' }
);
assert.match(legacyDateXml, /Στην Δοκιμαστική πόλη σήμερα την \d{1,2} του μηνός [\p{L}]+ του έτους \d{4} ημέρα της εβδομάδος [\p{L}]+/u,
  'Legacy fixed date text must use the current local date and installation drafting location when the case has no date/location');
assert.equal(valueFor('officerA.fullName', { title: 'NEW-CASE' }), 'Υπαστυνόμου Β΄ ΔΟΚΙΜΗΣ Αλεξάνδρου', 'A new case uses the current installation operator in genitive form');
assert.equal(valueFor('officerA.nominativeFullName', { title: 'NEW-CASE' }), 'Υπαστυνόμος Β΄ ΔΟΚΙΜΗΣ Αλέξανδρος');
assert.equal(valueFor('officerA.service', { title: 'NEW-CASE' }), 'Αστυνομικό Τμήμα Δοκιμής');
assert.equal(valueFor('officerA.residence', { title: 'NEW-CASE' }), 'Αστυνομικό Τμήμα Δοκιμής');
const historicalOfficerA = {
  fullName: 'Παλαιός Βαθμός ΠΑΛΑΙΟ ΕΠΩΝΥΜΟ ΠαλιόΌνομα',
  documentFullName: 'Παλαιού Βαθμού ΠΑΛΑΙΟΥ ΕΠΩΝΥΜΟΥ ΠαλιούΟνόματος',
  rank: 'Παλαιός Βαθμός', surname: 'ΠΑΛΑΙΟ ΕΠΩΝΥΜΟ', name: 'ΠαλιόΌνομα',
  service: 'Παλαιά Υπηρεσία', residence: 'Παλαιά Υπηρεσία'
};
globalThis.window.AXYP_SERVICE_PROFILE.get = () => ({ ...saved, operator: 'Νέος Βαθμός ΝΕΟΕΠΩΝΥΜΟ ΝέοΌνομα', operatorDocument: 'Νέου Βαθμού ΝΕΟΥΕΠΩΝΥΜΟΥ ΝέουΟνόματος', name: 'Νέα Υπηρεσία' });
assert.equal(valueFor('officerA.fullName', { title: 'HISTORICAL-CASE', officerA: historicalOfficerA }), historicalOfficerA.documentFullName, 'A saved case must retain its author genitive after the installation profile changes');
assert.equal(valueFor('officerA.nominativeFullName', { title: 'HISTORICAL-CASE', officerA: historicalOfficerA }), historicalOfficerA.fullName);
assert.equal(valueFor('officerA.rank', { title: 'HISTORICAL-CASE', officerA: historicalOfficerA }), historicalOfficerA.rank);
assert.equal(valueFor('officerA.surname', { title: 'HISTORICAL-CASE', officerA: historicalOfficerA }), historicalOfficerA.surname);
assert.equal(valueFor('officerA.name', { title: 'HISTORICAL-CASE', officerA: historicalOfficerA }), historicalOfficerA.name);
assert.equal(valueFor('officerA.service', { title: 'HISTORICAL-CASE', officerA: historicalOfficerA }), historicalOfficerA.service);
assert.equal(valueFor('officerA.residence', { title: 'HISTORICAL-CASE', officerA: historicalOfficerA }), historicalOfficerA.residence);
assert.equal(valueFor('officerA.fullName', { title: 'LEGACY-CASE-WITHOUT-SNAPSHOT' }), 'Νέου Βαθμού ΝΕΟΥΕΠΩΝΥΜΟΥ ΝέουΟνόματος', 'Legacy cases without a stored author snapshot retain the documented current-profile fallback');
const legacyCaseOfficerA = { rank: 'Παλιός Βαθμός', surname: 'ΠΑΛΑΙΟ', name: 'ΠαλιόΌνομα' };
assert.equal(valueFor('officerA.fullName', { title: 'OLD-CASE-LEGACY-FIELDS', officerA: legacyCaseOfficerA }), 'Παλιού Βαθμού ΠΑΛΑΙΟ ΠαλιόΌνομα', 'Legacy case-level officer fields remain usable and are conservatively inflected only where supported');
assert.equal(valueFor('officerA.nominativeFullName', { title: 'OLD-CASE-LEGACY-FIELDS', officerA: legacyCaseOfficerA }), 'Παλιός Βαθμός ΠΑΛΑΙΟ ΠαλιόΌνομα', 'Legacy case-level officer fields retain their original nominative identity');
assert.equal(valueFor('officerB.fullName', { title: 'CASE-ONLY-DATA' }), 'Αρχιφύλακα ΔΟΚΙΜΗΣ Γεώργιου');
assert.equal(valueFor('officerB.nominativeFullName', { title: 'CASE-ONLY-DATA' }), 'Αρχιφύλακας ΔΟΚΙΜΗΣ Γεώργιος');
assert.equal(valueFor('officerB.service', { title: 'CASE-ONLY-DATA' }), 'Νέα Υπηρεσία', 'A case without a saved second-investigator service uses the current installation service profile');
assert.equal(valueFor('officerB.residence', { title: 'CASE-ONLY-DATA' }), 'Νέα Υπηρεσία', 'A case without a saved second-investigator residence uses the current installation service profile');
globalThis.window.AXYP_SERVICE_PROFILE.get = () => empty;
assert.equal(valueFor('officerA.fullName', { title: 'DEFAULT-PROFILE' }), "Υπαστυνόμου Β' ΓΙΟΥΡΟΥΚΗ Τραϊανού");
assert.equal(valueFor('officerB.fullName', { title: 'DEFAULT-PROFILE' }), 'Αρχιφύλακα ΒΟΥΤΥΡΙΤΣΑ Γεώργιου');
globalThis.window.AXYP_SERVICE_PROFILE.get = () => saved;
assert.equal(valueFor('service.chemicalService', { title: 'CASE-ONLY-DATA' }), 'Χημική Υπηρεσία Δοκιμής');
assert.equal(valueFor('service.prosecutor', { title: 'CASE-ONLY-DATA' }), 'Εισαγγελία Πρωτοδικών Δοκιμής');
assert.ok(!JSON.stringify(saved).includes('Τριφυλ'));
assert.ok(!JSON.stringify(saved).includes('Κυπαρισσ'));

const legacyStorage = {
  getItem() { return JSON.stringify({ name: 'Αστυνομικό Τμήμα Παλαιάς Εγκατάστασης', operator: '' }); },
  setItem() {}
};
assert.equal(readServiceProfile(legacyStorage).operator, '', 'Legacy profiles must not inherit a hardcoded officer identity');
const legacyCustomStorage = {
  getItem() { return JSON.stringify({ name: 'Αστυνομικό Τμήμα Άλλης Υπηρεσίας', operator: 'Αστυνόμος ΔΟΚΙΜΗΣ Νίκος' }); },
  setItem() {}
};
assert.equal(readServiceProfile(legacyCustomStorage).operator, 'Αστυνόμος ΔΟΚΙΜΗΣ Νίκος');
assert.equal(readServiceProfile(legacyCustomStorage).operatorDocument, '', 'A legacy custom operator must not inherit another officer’s genitive form');
assert.equal(toGreekGenitiveFullName(readServiceProfile(legacyCustomStorage).operator), 'Αστυνόμου ΔΟΚΙΜΗ Νίκου');

const malformed = { getItem: () => '{invalid', setItem() {} };
assert.equal(readServiceProfile(malformed).name, '', 'Malformed stored data must fall back to neutral defaults');
assert.equal(readServiceProfile(malformed).location, '');
assert.equal(readServiceProfile(malformed).operator, '');
assert.equal(readServiceProfile(malformed).secondOfficer, '', 'Malformed stored data must not inherit officer identity');
const whitespaceOperator = '  Υ/Β΄ ΔΟΚΙΜΗΣ Αλέξανδρος  ';
const restoredWhitespace = getServiceProfileRestoreEntry({ serviceProfile: JSON.stringify({ operator: whitespaceOperator }) });
assert.equal(JSON.parse(restoredWhitespace[1]).operator, whitespaceOperator, 'Backup restore must preserve the operator value verbatim');
const legacyRestored = JSON.parse(getServiceProfileRestoreEntry({ serviceProfile: JSON.stringify({ operator: 'Αστυνόμος ΔΟΚΙΜΗΣ Νίκος' }) })[1]);
assert.equal(legacyRestored.operatorDocument, '', 'Restoring a legacy custom operator must not assign the default officer genitive form');
assert.throws(() => writeServiceProfile(null, {}), /τοπική αποθήκευση/);
console.log('Per-installation service profile tests passed.');
