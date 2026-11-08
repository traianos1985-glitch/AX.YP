import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildOfficialDossierPackage, buildCategoryArchive, templatesForCategoryGeneration } from '../template-library.js';
import { unzipSync } from '../vendor/fflate.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const hypotheses = await readFile(new URL('../hypotheses.js', import.meta.url), 'utf8');
const library = await readFile(new URL('../template-library.js', import.meta.url), 'utf8');
const vite = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const catalog = JSON.parse(await readFile(new URL('../dossier-packages/manifest.json', import.meta.url), 'utf8'));

assert.equal(catalog.schemaVersion, 1);
assert.ok(Array.isArray(catalog.packages));
assert.match(html, /id="dossier-template-list"/);
assert.match(html, /id="case-export-dossier"/);
assert.match(html, /Συμπλήρωση και εξαγωγή όλων των Word/);
assert.match(hypotheses, /async function renderDossierTemplates/);
assert.match(hypotheses, /async function exportCategoryDossier/);
assert.match(hypotheses, /template\.source === 'user-uploaded' \|\| template\.source === 'published-package'/);
assert.match(hypotheses, /buildCategoryArchive\(selectedTemplates, saved\)/);
assert.doesNotMatch(hypotheses, /reset\(\);\s*\$\('case-date'\)\.value = ''/, 'Successful export must preserve the automatically populated date for the next case');
assert.match(library, /source === 'published-package'/);
assert.match(library, /loadPublishedDossierPackages/);
assert.doesNotMatch(library, /enteredName = window\.prompt/);
assert.doesNotMatch(library, /Εξαγωγή επίσημου πακέτου για δημοσίευση/);
assert.match(library, /export function buildOfficialDossierPackage/);
assert.match(library, /const baseName = String\(template\.name/);
assert.match(library, /new URL\('dossier-packages\/manifest\.json', document\.baseURI\)/);
assert.match(vite, /dossier-packages/);
assert.match(serviceWorker, /dossier-packages\/manifest\.json/);

const local = { id: 'local-1', category: 'generic', source: 'user-uploaded', name: 'local.docx' };
const published = { id: 'published-1', category: 'generic', source: 'published-package', name: 'published.docx' };
const example = { id: 'example-1', category: 'generic', source: 'builtin', name: 'example.docx' };
assert.deepEqual(templatesForCategoryGeneration([example, local, published]), [local, published]);
assert.deepEqual(templatesForCategoryGeneration([example]), [example]);

const xml = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{{case.protocolNumber}}</w:t></w:r></w:p></w:body></w:document>';
const template = {
  id: 'official-generic-01',
  name: 'Αναφορά.docx',
  category: 'generic',
  source: 'user-uploaded',
  mappingConfirmedAt: '2026-11-07T00:00:00.000Z',
  fields: ['case.protocolNumber'],
  mappings: { 'case.protocolNumber': 'case.protocolNumber' },
  files: { 'word/document.xml': Array.from(new TextEncoder().encode(xml)) }
};
const packageBytes = buildOfficialDossierPackage([template], 'generic');
const packageParts = unzipSync(packageBytes);
assert.ok(packageParts['manifest.json']);
const packageManifest = JSON.parse(new TextDecoder().decode(packageParts['manifest.json']));
assert.equal(packageManifest.category, 'generic');
assert.equal(packageManifest.schemaVersion, 1);
assert.equal(packageManifest.documents.length, 1);
assert.equal(packageManifest.documents[0].name, 'Αναφορά.docx');
const docxParts = unzipSync(packageParts[packageManifest.documents[0].path]);
assert.equal(new TextDecoder().decode(docxParts['word/document.xml']), xml);
assert.throws(() => buildOfficialDossierPackage([{ ...template, mappingConfirmedAt: null }], 'generic'), /αντιστοίχιση πεδίων/);

const generatedArchive = buildCategoryArchive([{ ...template, name: '../unsafe:name.docx' }], { id: 'case-1', protocolNumber: '123' });
const generatedArchiveNames = Object.keys(unzipSync(generatedArchive));
assert.equal(generatedArchiveNames.length, 1);
assert.match(generatedArchiveNames[0], /^01-.*-case-1\.docx$/u);
assert.doesNotMatch(generatedArchiveNames[0], /[\\/]/u);

console.log('Official dossier package workflow tests passed.');
