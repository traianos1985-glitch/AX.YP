import assert from 'node:assert/strict';
import { unzipSync, zipSync } from '../vendor/fflate.js';
import {
  TEMPLATE_DOCUMENT_HISTORY_LIMIT,
  createTemplateDocumentSnapshot,
  appendTemplateDocumentSnapshot,
  restoreTemplateDocumentSnapshot,
  extractTemplateFieldsFromParts
} from '../template-document-history.js';

const originalParts = {
  'word/document.xml': new TextEncoder().encode('<w:document><w:t>Αρχικό {{person.fullName}}</w:t></w:document>'),
  'word/styles.xml': new TextEncoder().encode('<w:styles/>')
};
const template = {
  id: 'template-1',
  files: Object.fromEntries(Object.entries(originalParts).map(([path, bytes]) => [path, Array.from(bytes)]))
};
const snapshot = createTemplateDocumentSnapshot(template, {
  label: 'Πριν από διόρθωση',
  savedAt: '2026-11-08T10:00:00.000Z'
});
assert.equal(snapshot.label, 'Πριν από διόρθωση');
assert.equal(snapshot.savedAt, '2026-11-08T10:00:00.000Z');

const history = appendTemplateDocumentSnapshot([], snapshot);
assert.equal(history.length, 1);
const restored = restoreTemplateDocumentSnapshot(history[0]);
assert.deepEqual(Object.keys(restored).sort(), Object.keys(originalParts).sort());
assert.equal(new TextDecoder().decode(new Uint8Array(restored['word/document.xml'])), new TextDecoder().decode(originalParts['word/document.xml']));
assert.deepEqual(extractTemplateFieldsFromParts(Object.fromEntries(Object.entries(restored).map(([path, bytes]) => [path, new Uint8Array(bytes)]))), ['person.fullName']);

let bounded = [];
for (let index = 0; index < TEMPLATE_DOCUMENT_HISTORY_LIMIT + 2; index++) {
  bounded = appendTemplateDocumentSnapshot(bounded, { ...snapshot, savedAt: String(index) });
}
assert.equal(bounded.length, TEMPLATE_DOCUMENT_HISTORY_LIMIT);
assert.equal(bounded[0].savedAt, '2');

assert.throws(() => createTemplateDocumentSnapshot({ files: {} }), /κύριο σώμα/u);
assert.throws(() => restoreTemplateDocumentSnapshot({}), /δεν περιέχει/u);
assert.throws(() => appendTemplateDocumentSnapshot([], {}), /δεν είναι έγκυρο/u);
console.log('Template document editing history tests passed.');
