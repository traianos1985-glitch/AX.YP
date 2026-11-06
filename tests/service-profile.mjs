import assert from 'node:assert/strict';
import { readServiceProfile, writeServiceProfile, SERVICE_PROFILE_FIELDS } from '../service-profile.js';

const values = new Map();
const storage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); }
};
const empty = readServiceProfile(storage);
assert.deepEqual(Object.keys(empty), [...SERVICE_PROFILE_FIELDS]);
assert.ok(Object.values(empty).every((value) => value === ''));

const saved = writeServiceProfile(storage, {
  name: 'Αστυνομικό Τμήμα Δοκιμής',
  address: 'Οδός Δοκιμής 1',
  phone: '2100000000',
  email: 'test@example.invalid',
  prosecutor: 'Εισαγγελία Πρωτοδικών Δοκιμής',
  chemicalService: 'Χημική Υπηρεσία Δοκιμής',
  ignored: 'must not be persisted'
});
assert.equal(saved.name, 'Αστυνομικό Τμήμα Δοκιμής');
assert.equal(saved.chemicalService, 'Χημική Υπηρεσία Δοκιμής');
assert.ok(!Object.hasOwn(saved, 'ignored'));
assert.deepEqual(readServiceProfile(storage), saved);

globalThis.window = { AXYP_SERVICE_PROFILE: { get: () => saved } };
const { valueFor } = await import('../template-library.js');
assert.equal(valueFor('service.name', { title: 'CASE-ONLY-DATA' }), 'Αστυνομικό Τμήμα Δοκιμής');
assert.equal(valueFor('service.chemicalService', { title: 'CASE-ONLY-DATA' }), 'Χημική Υπηρεσία Δοκιμής');
assert.equal(valueFor('service.prosecutor', { title: 'CASE-ONLY-DATA' }), 'Εισαγγελία Πρωτοδικών Δοκιμής');
assert.ok(!JSON.stringify(saved).includes('Τριφυλ'));
assert.ok(!JSON.stringify(saved).includes('Κυπαρισσ'));

const malformed = { getItem: () => '{invalid', setItem() {} };
assert.ok(Object.values(readServiceProfile(malformed)).every((value) => value === ''));
assert.throws(() => writeServiceProfile(null, {}), /τοπική αποθήκευση/);
console.log('Per-installation service profile tests passed.');
