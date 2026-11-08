import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  extractTemplateTextRuns,
  applyTemplateTextEdits
} from '../template-document-editor.js';

const library = await readFile(new URL('../template-library.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
assert.match(library, /function openTemplateDocumentEditor\(template\)/u);
assert.match(library, /window\.AXYP_ROLE\.isAdmin\(\)/u);
assert.match(library, /createTemplateDocumentSnapshot\(backupTemplate/u);
assert.match(library, /appendTemplateDocumentSnapshot\(active\.documentHistory, backup\)/u);
assert.match(library, /Προεπισκόπηση \/ επεξεργασία κειμένου/u);
assert.match(html, /Τα placeholders παραμένουν κλειδωμένα/u);

const original = {
  'word/document.xml': new TextEncoder().encode(
    '<w:document><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Αρχικό</w:t></w:r><w:r><w:t xml:space="preserve"> κείμενο</w:t></w:r><w:r><w:t>{{person.fullName}}</w:t></w:r></w:p><w:p><w:r><w:t>{{person.</w:t></w:r><w:r><w:t>fullName}}</w:t></w:r></w:p></w:body></w:document>'
  ),
  'word/header1.xml': new TextEncoder().encode('<w:hdr><w:p><w:r><w:t>Κεφαλίδα</w:t></w:r></w:p></w:hdr>'),
  'word/styles.xml': new TextEncoder().encode('<w:styles><w:style w:styleId="Keep"/></w:styles>'),
  'word/media/image1.png': new Uint8Array([1, 2, 3])
};

const runs = extractTemplateTextRuns(original);
assert.deepEqual(runs.map(({ path, index, paragraphIndex, text, editable }) => ({ path, index, paragraphIndex, text, editable })), [
  { path: 'word/document.xml', index: 0, paragraphIndex: 0, text: 'Αρχικό', editable: true },
  { path: 'word/document.xml', index: 1, paragraphIndex: 0, text: ' κείμενο', editable: true },
  { path: 'word/document.xml', index: 2, paragraphIndex: 0, text: '{{person.fullName}}', editable: false },
  { path: 'word/document.xml', index: 3, paragraphIndex: 1, text: '{{person.', editable: false },
  { path: 'word/document.xml', index: 4, paragraphIndex: 1, text: 'fullName}}', editable: false },
  { path: 'word/header1.xml', index: 0, paragraphIndex: 0, text: 'Κεφαλίδα', editable: true }
]);

const updated = applyTemplateTextEdits(original, [
  { path: 'word/document.xml', index: 0, originalText: 'Αρχικό', text: 'Διορθωμένο & νέο' },
  { path: 'word/header1.xml', index: 0, originalText: 'Κεφαλίδα', text: 'Νέα κεφαλίδα' }
]);
const documentXml = new TextDecoder().decode(updated['word/document.xml']);
assert.match(documentXml, /<w:rPr><w:b\/><\/w:rPr><w:t>Διορθωμένο &amp; νέο<\/w:t>/u);
assert.match(documentXml, /<w:t xml:space="preserve"> κείμενο<\/w:t>/u);
assert.match(documentXml, /<w:t>\{\{person\.fullName\}\}<\/w:t>/u);
assert.equal(new TextDecoder().decode(updated['word/header1.xml']), '<w:hdr><w:p><w:r><w:t>Νέα κεφαλίδα</w:t></w:r></w:p></w:hdr>');
assert.deepEqual(updated['word/styles.xml'], original['word/styles.xml']);
assert.deepEqual(updated['word/media/image1.png'], original['word/media/image1.png']);
assert.deepEqual(original['word/document.xml'], new TextEncoder().encode(
  '<w:document><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Αρχικό</w:t></w:r><w:r><w:t xml:space="preserve"> κείμενο</w:t></w:r><w:r><w:t>{{person.fullName}}</w:t></w:r></w:p></w:body></w:document>'
));

assert.throws(() => applyTemplateTextEdits(original, [
  { path: 'word/document.xml', index: 2, originalText: '{{person.fullName}}', text: 'Όνομα' }
]), /placeholders δεν επιτρέπεται/u);
assert.throws(() => applyTemplateTextEdits(original, [
  { path: 'word/document.xml', index: 3, originalText: '{{person.', text: 'Όνομα' }
]), /placeholders δεν επιτρέπεται/u);
assert.throws(() => applyTemplateTextEdits(original, [
  { path: 'word/document.xml', index: 0, originalText: 'Άλλο', text: 'Κείμενο' }
]), /άλλαξε από τότε/u);
assert.throws(() => applyTemplateTextEdits(original, [
  { path: 'word/styles.xml', index: 0, originalText: 'Keep', text: 'Break' }
]), /Μη έγκυρη αλλαγή/u);
assert.throws(() => applyTemplateTextEdits(original, [
  { path: 'word/document.xml', index: 0, originalText: 'Αρχικό', text: 'x'.repeat(10001) }
]), /υπερβαίνει/u);

console.log('Safe template text editor tests passed.');
