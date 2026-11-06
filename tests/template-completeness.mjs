import assert from 'node:assert/strict';
import { getMissingTemplateFields } from '../template-library.js';

globalThis.window = { AXYP_SERVICE_PROFILE: { get: () => ({ name: '', address: '', phone: '', email: '', prosecutor: '', chemicalService: '' }) } };

const template = {
  fields: ['case.title', 'person.name', 'service.name', 'unknown.field'],
  mappings: {}
};
const item = { title: 'Δοκιμαστική υπόθεση', offender: { name: '' } };
assert.deepEqual(getMissingTemplateFields(template, item), [
  { field: 'person.name', reason: 'δεν έχει συμπληρωθεί' },
  { field: 'service.name', reason: 'δεν έχει συμπληρωθεί' },
  { field: 'unknown.field', reason: 'δεν έχει αντιστοιχιστεί' }
]);

const completeItem = { title: 'Δοκιμαστική υπόθεση', offender: { name: 'Μαρία' } };
globalThis.window.AXYP_SERVICE_PROFILE = { get: () => ({ name: 'Αστυνομική Υπηρεσία' }) };
assert.deepEqual(getMissingTemplateFields(template, completeItem), [
  { field: 'unknown.field', reason: 'δεν έχει αντιστοιχιστεί' }
]);

const mappedTemplate = { fields: ['case.title'], mappings: { 'case.title': 'case.title' } };
assert.deepEqual(getMissingTemplateFields(mappedTemplate, completeItem), []);
assert.deepEqual(getMissingTemplateFields({ fields: [] }, completeItem), []);
console.log('Pre-download template completeness tests passed.');
