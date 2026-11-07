import assert from 'node:assert/strict';
import { readServiceProfile, writeServiceProfile, SERVICE_PROFILE_FIELDS, SERVICE_PROFILE_STORAGE_KEY, getServiceProfileBackupValue, getServiceProfileRestoreEntry } from '../service-profile.js';

assert.equal(SERVICE_PROFILE_STORAGE_KEY, 'axyp-service-profile-v1');
const values = new Map();
const storage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); }
};
const empty = readServiceProfile(storage);
assert.deepEqual(Object.keys(empty), [...SERVICE_PROFILE_FIELDS]);
assert.equal(empty.name, 'Αστυνομικό Τμήμα Τριφυλίας');
assert.equal(empty.operator, '');
assert.ok(Object.values(empty).filter((_, index) => index !== SERVICE_PROFILE_FIELDS.indexOf('name')).every((value) => value === ''));
assert.equal(getServiceProfileBackupValue(storage), JSON.stringify(empty), 'An empty profile must also be backed up to prevent stale cross-installation values');

const saved = writeServiceProfile(storage, {
  name: 'Αστυνομικό Τμήμα Δοκιμής',
  address: 'Οδός Δοκιμής 1',
  phone: '2100000000',
  email: 'test@example.invalid',
  prosecutor: 'Εισαγγελία Πρωτοδικών Δοκιμής',
  chemicalService: 'Χημική Υπηρεσία Δοκιμής',
  operator: 'Υπαστυνόμος Β΄ ΔΟΚΙΜΗΣ Αλέξανδρος',
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
assert.equal(valueFor('officerA.fullName', { title: 'CASE-ONLY-DATA' }), 'Υπαστυνόμος Β΄ ΔΟΚΙΜΗΣ Αλέξανδρος');
assert.equal(valueFor('service.chemicalService', { title: 'CASE-ONLY-DATA' }), 'Χημική Υπηρεσία Δοκιμής');
assert.equal(valueFor('service.prosecutor', { title: 'CASE-ONLY-DATA' }), 'Εισαγγελία Πρωτοδικών Δοκιμής');
assert.ok(!JSON.stringify(saved).includes('Τριφυλ'));
assert.ok(!JSON.stringify(saved).includes('Κυπαρισσ'));

const malformed = { getItem: () => '{invalid', setItem() {} };
assert.ok(Object.values(readServiceProfile(malformed)).every((value) => value === ''));
assert.throws(() => writeServiceProfile(null, {}), /τοπική αποθήκευση/);
console.log('Per-installation service profile tests passed.');
