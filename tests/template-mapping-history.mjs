import assert from 'node:assert/strict';
import { listTemplateMappingVersions, saveTemplateMappingVersion, restoreTemplateMappingVersion } from '../template-mapping-history.js';

const values = new Map();
const storage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); }
};
const template = { id: 'doc-1', name: 'Έντυπο δοκιμής' };
assert.deepEqual(listTemplateMappingVersions(template, storage), []);
const first = saveTemplateMappingVersion(template, { 'officerA.fullName': 'officerA.fullName' }, storage);
const second = saveTemplateMappingVersion(template, { 'officerA.fullName': 'service.operator' }, storage, { label: 'Αλλαγή χειριστή' });
assert.equal(first.version, 1);
assert.equal(second.version, 2);
assert.equal(listTemplateMappingVersions(template, storage).length, 2);
assert.deepEqual(restoreTemplateMappingVersion(template, 1, storage), { 'officerA.fullName': 'officerA.fullName' });
assert.deepEqual(restoreTemplateMappingVersion(template, 2, storage), { 'officerA.fullName': 'service.operator' });
assert.throws(() => restoreTemplateMappingVersion(template, 99, storage), /δεν βρέθηκε/u);
assert.throws(() => saveTemplateMappingVersion({}, {}, storage), /αναγνωριστικό/u);
console.log('Template mapping history tests passed.');
