import assert from 'node:assert/strict';
import { mergeTemplateOverrides } from '../template-catalog.js';

const published = [
  { id: 'narcotics-01', name: 'Published old', source: 'published-package' },
  { id: 'narcotics-02', name: 'Published unchanged', source: 'published-package' }
];
const local = [
  { id: 'narcotics-01', name: 'Admin corrected', source: 'user-uploaded', documentRevision: 2 },
  { id: 'custom-1', name: 'Admin addition', source: 'user-uploaded' }
];
const merged = mergeTemplateOverrides(published, local);
assert.deepEqual(merged.map((template) => template.name), [
  'Published unchanged',
  'Admin corrected',
  'Admin addition'
]);
assert.equal(merged.filter((template) => template.id === 'narcotics-01').length, 1);
assert.equal(merged.find((template) => template.id === 'narcotics-01').documentRevision, 2);

const duplicateLocal = mergeTemplateOverrides(published, [
  { id: 'narcotics-01', name: 'Older local copy' },
  { id: 'narcotics-01', name: 'Latest local copy' }
]);
assert.equal(duplicateLocal.filter((template) => template.id === 'narcotics-01').length, 1);
assert.equal(duplicateLocal.find((template) => template.id === 'narcotics-01').name, 'Latest local copy');

const withoutIds = mergeTemplateOverrides([{ name: 'Published no id' }], [{ name: 'Local no id' }]);
assert.deepEqual(withoutIds.map((template) => template.name), ['Published no id', 'Local no id']);
assert.deepEqual(mergeTemplateOverrides(null, null), []);
console.log('Template catalog override tests passed.');
