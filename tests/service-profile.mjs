import assert from 'node:assert/strict';
import { readServiceProfile, writeServiceProfile, SERVICE_PROFILE_FIELDS, SERVICE_PROFILE_STORAGE_KEY, getServiceProfileBackupValue, getServiceProfileRestoreEntry, toGreekGenitiveFullName } from '../service-profile.js';

assert.equal(SERVICE_PROFILE_STORAGE_KEY, 'axyp-service-profile-v1');
assert.equal(toGreekGenitiveFullName("Υπαστυνόμος Β' ΓΙΟΥΡΟΥΚΗΣ Τραϊανός"), "Υπαστυνόμου Β' ΓΙΟΥΡΟΥΚΗ Τραϊανού");
assert.equal(toGreekGenitiveFullName('Αρχιφύλακας ΒΟΥΤΥΡΙΤΣΑΣ Γεώργιος'), 'Αρχιφύλακα ΒΟΥΤΥΡΙΤΣΑ Γεώργιου');
const values = new Map();
const storage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); }
};
const empty = readServiceProfile(storage);
assert.deepEqual(Object.keys(empty), [...SERVICE_PROFILE_FIELDS]);
assert.equal(empty.name, 'Αστυνομικό Τμήμα Τριφυλίας');
assert.equal(empty.location, 'Κυπαρισσία');
assert.equal(empty.operator, "Υπαστυνόμος Β' ΓΙΟΥΡΟΥΚΗΣ Τραϊανός");
assert.equal(empty.operatorDocument, '');
assert.equal(empty.secondOfficer, 'Αρχιφύλακας ΒΟΥΤΥΡΙΤΣΑΣ Γεώργιος');
assert.equal(empty.secondOfficerDocument, '');
assert.ok(Object.entries(empty).filter(([field]) => !['name', 'location', 'operator', 'operatorDocument', 'secondOfficer', 'secondOfficerDocument'].includes(field)).every(([, value]) => value === ''));
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
const exactOperator = writeServiceProfile(storage, { operator: '  Υ/Β΄ ΓΙΟΥΡΟΥΚΗΣ Τραϊανός  ' });
assert.equal(exactOperator.operator, '  Υ/Β΄ ΓΙΟΥΡΟΥΚΗΣ Τραϊανός  ', 'Operator display text must be preserved verbatim');
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
const { valueFor } = await import('../template-library.js');
assert.equal(valueFor('service.name', { title: 'CASE-ONLY-DATA' }), 'Αστυνομικό Τμήμα Δοκιμής');
assert.equal(valueFor('case.location', { title: 'CASE-ONLY-DATA' }), 'Δοκιμαστική πόλη');
assert.match(valueFor('case.date', { title: 'CASE-ONLY-DATA' }), /^\d{2}\/\d{2}\/\d{4}$/u);
assert.equal(valueFor('case.date.weekdayName', { date: '2026-11-07' }), 'Σάββατο');
assert.equal(valueFor('officerA.fullName', { title: 'CASE-ONLY-DATA', officerA: { rank: 'Αρχιφύλακας', surname: 'ΑΛΛΟ', name: 'Πρόσωπο' } }), 'Υπαστυνόμου Β΄ ΔΟΚΙΜΗΣ Αλεξάνδρου', 'The first investigator uses the configured genitive document form');
assert.equal(valueFor('officerA.nominativeFullName', { title: 'CASE-ONLY-DATA' }), 'Υπαστυνόμος Β΄ ΔΟΚΙΜΗΣ Αλέξανδρος');
assert.equal(valueFor('officerA.service', { title: 'CASE-ONLY-DATA' }), 'Αστυνομικό Τμήμα Δοκιμής');
assert.equal(valueFor('officerB.fullName', { title: 'CASE-ONLY-DATA' }), 'Αρχιφύλακα ΔΟΚΙΜΗΣ Γεώργιου');
assert.equal(valueFor('officerB.nominativeFullName', { title: 'CASE-ONLY-DATA' }), 'Αρχιφύλακας ΔΟΚΙΜΗΣ Γεώργιος');
assert.equal(valueFor('officerB.service', { title: 'CASE-ONLY-DATA' }), 'Αστυνομικό Τμήμα Δοκιμής');
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
assert.equal(readServiceProfile(legacyStorage).operator, "Υπαστυνόμος Β' ΓΙΟΥΡΟΥΚΗΣ Τραϊανός", 'Existing installations with an empty legacy operator receive the new default');
const legacyCustomStorage = {
  getItem() { return JSON.stringify({ name: 'Αστυνομικό Τμήμα Άλλης Υπηρεσίας', operator: 'Αστυνόμος ΔΟΚΙΜΗΣ Νίκος' }); },
  setItem() {}
};
assert.equal(readServiceProfile(legacyCustomStorage).operator, 'Αστυνόμος ΔΟΚΙΜΗΣ Νίκος');
assert.equal(readServiceProfile(legacyCustomStorage).operatorDocument, '', 'A legacy custom operator must not inherit another officer’s genitive form');
assert.equal(toGreekGenitiveFullName(readServiceProfile(legacyCustomStorage).operator), 'Αστυνόμου ΔΟΚΙΜΗ Νίκου');

const malformed = { getItem: () => '{invalid', setItem() {} };
assert.equal(readServiceProfile(malformed).name, 'Αστυνομικό Τμήμα Τριφυλίας', 'Malformed stored data must fall back to the installation default service name');
assert.equal(readServiceProfile(malformed).location, 'Κυπαρισσία');
assert.equal(readServiceProfile(malformed).operator, "Υπαστυνόμος Β' ΓΙΟΥΡΟΥΚΗΣ Τραϊανός");
assert.equal(readServiceProfile(malformed).secondOfficer, 'Αρχιφύλακας ΒΟΥΤΥΡΙΤΣΑΣ Γεώργιος', 'Malformed stored data must fall back to installation defaults');
const whitespaceOperator = '  Υ/Β΄ ΓΙΟΥΡΟΥΚΗΣ Τραϊανός  ';
const restoredWhitespace = getServiceProfileRestoreEntry({ serviceProfile: JSON.stringify({ operator: whitespaceOperator }) });
assert.equal(JSON.parse(restoredWhitespace[1]).operator, whitespaceOperator, 'Backup restore must preserve the operator value verbatim');
const legacyRestored = JSON.parse(getServiceProfileRestoreEntry({ serviceProfile: JSON.stringify({ operator: 'Αστυνόμος ΔΟΚΙΜΗΣ Νίκος' }) })[1]);
assert.equal(legacyRestored.operatorDocument, '', 'Restoring a legacy custom operator must not assign the default officer genitive form');
assert.throws(() => writeServiceProfile(null, {}), /τοπική αποθήκευση/);
console.log('Per-installation service profile tests passed.');
