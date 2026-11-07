import assert from 'node:assert/strict';
import { buildDocx, buildCategoryArchive, getMissingTemplateFields, templatesForCategoryGeneration } from '../template-library.js';
import { unzipSync } from '../vendor/fflate.js';

const encode = (value) => new TextEncoder().encode(value);
const decode = (value) => new TextDecoder().decode(value);
const originalParts = {
  '[Content_Types].xml': encode('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>'),
  '_rels/.rels': encode('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="officeDocument" Target="word/document.xml"/></Relationships>'),
  'word/document.xml': encode('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{{person.fullName}}</w:t></w:r></w:p><w:p><w:r><w:t>{{person.address}}</w:t></w:r></w:p><w:p><w:r><w:t>Αναφορά </w:t></w:r><w:r><w:t>{{case.title}}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>'),
  'word/header1.xml': encode('<?xml version="1.0"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>{{case.</w:t></w:r><w:r><w:t>protocolNumber}}</w:t></w:r></w:p></w:hdr>'),
  'word/footer1.xml': encode('<?xml version="1.0"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Αυθεντικό υποσέλιδο</w:t></w:r></w:p></w:ftr>'),
  'word/_rels/document.xml.rels': encode('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>'),
  'word/styles.xml': encode('<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Normal"/></w:styles>'),
  'docProps/core.xml': encode('<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Original metadata</dc:title></cp:coreProperties>')
};
const template = {
  id: 'uploaded-form-001',
  name: 'Αυθεντικό έντυπο.docx',
  category: 'narcotics',
  source: 'user-uploaded',
  fidelityMode: 'placeholder-only',
  fields: ['person.fullName', 'person.address', 'case.title', 'case.protocolNumber'],
  mappings: {},
  files: Object.fromEntries(Object.entries(originalParts).map(([name, bytes]) => [name, Array.from(bytes)]))
};
const item = {
  id: 'synthetic-case-001',
  title: 'TEST CASE TITLE',
  protocolNumber: 'TEST-PROTOCOL-001',
  offender: { surname: 'TEST SURNAME', name: 'TEST NAME' }
};

const generated = unzipSync(buildDocx(template, item));
assert.deepEqual(Object.keys(generated).sort(), Object.keys(originalParts).sort(), 'No package parts may be added or removed for an uploaded form');
for (const path of Object.keys(originalParts)) {
  if (path === 'word/document.xml' || path === 'word/header1.xml') continue;
  assert.deepEqual(generated[path], originalParts[path], path + ' must remain byte-identical');
}
const documentXml = decode(generated['word/document.xml']);
const headerXml = decode(generated['word/header1.xml']);
assert.ok(documentXml.includes('TEST SURNAME TEST NAME'));
assert.ok(documentXml.includes('TEST CASE TITLE'));
assert.ok(documentXml.includes('{{person.address}}'), 'Missing uploaded-form fields must remain visible for manual completion');
assert.ok(getMissingTemplateFields(template, item).some((entry) => entry.field === 'person.address'));
assert.ok(headerXml.includes('TEST-PROTOCOL-001'));
assert.ok(!documentXml.includes('{{'));
assert.ok(!headerXml.includes('{{'));
assert.equal(decode(generated['word/footer1.xml']).includes('Αυθεντικό υποσέλιδο'), true);
assert.ok(!Object.keys(generated).some((path) => /^word\/footer\d+\.xml$/u.test(path) && !Object.hasOwn(originalParts, path)), 'The generator must not inject an AX.YP footer');

const builtInExample = { ...template, id: 'builtin-example', name: 'Ενσωματωμένο παράδειγμα.docx', source: undefined };
const selectedTemplates = templatesForCategoryGeneration([builtInExample, template, { ...template, id: 'uploaded-form-002', name: 'Δεύτερο έντυπο.docx' }]);
assert.deepEqual(selectedTemplates.map((entry) => entry.id), ['uploaded-form-001', 'uploaded-form-002'], 'Uploaded authentic forms must take precedence over built-in examples');
assert.deepEqual(templatesForCategoryGeneration([builtInExample]), [builtInExample], 'Built-in templates remain available when no authentic form has been uploaded');
const archive = unzipSync(buildCategoryArchive(selectedTemplates, item));
assert.equal(Object.keys(archive).length, 2, 'Category ZIP must contain each selected DOCX exactly once');
for (const [name, bytes] of Object.entries(archive)) {
  assert.ok(name.endsWith('.docx'));
  const nested = unzipSync(bytes);
  assert.ok(decode(nested['word/document.xml']).includes('TEST SURNAME TEST NAME'));
}
console.log('Uploaded DOCX fidelity and category archive tests passed.');
