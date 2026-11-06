import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_COMMERCE_TEMPLATES } from '../paremporio-templates.js';
import { ensureDefaultTemplates, getTemplateParts, replaceInXml, valueFor } from '../template-library.js';
import { strFromU8, strToU8, zipSync, unzipSync } from '../vendor/fflate.js';

function createMockStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

const storage = createMockStorage();
ensureDefaultTemplates(storage);
const seeded = JSON.parse(storage.getItem('axyp-docx-templates'));
const templates = seeded.filter((template) => template.category === 'commerce');
assert.equal(templates.length, 8, 'All eight commerce templates should be seeded');

const syntheticCase = {
  id: 'commerce-mapping-test',
  profile: 'commerce',
  title: 'Synthetic commerce case',
  protocolNumber: 'TEST/001',
  date: '2026-11-05',
  time: '10:00',
  location: 'TEST LOCATION',
  offence: 'TEST OFFENCE',
  notes: 'TEST NOTES',
  arrestingOfficer: 'TEST OFFICER',
  evidence: 'TEST EVIDENCE',
  offenderA: { fullName: 'ACTOR-A-FULL-NAME', idNumber: 'ACTOR-A-ID', address: 'ACTOR-A-ADDRESS' },
  offenderB: { fullName: 'ACTOR-B-FULL-NAME', idNumber: 'ACTOR-B-ID', address: 'ACTOR-B-ADDRESS' },
  timeline: { arrestStartTime: '10:00', arrestEndTime: '10:10' },
  officerA: { fullName: 'OFFICER-A' },
  officerB: { fullName: 'OFFICER-B' }
};

assert.equal(valueFor('offenderA.fullName', syntheticCase), 'ACTOR-A-FULL-NAME');
assert.equal(valueFor('offenderB.fullName', syntheticCase), 'ACTOR-B-FULL-NAME');
assert.equal(
  valueFor('offenderA.fullName', { offenderA: { surname: 'LEGACY-SURNAME', name: 'LEGACY-NAME' } }),
  'LEGACY-SURNAME LEGACY-NAME',
  'Older split-name records remain supported'
);

for (const template of templates) {
  assert.equal(template.status, 'temporary', template.name + ' must be explicitly marked provisional');
  assert.ok(template.statusLabel.includes('πραγματικό υπηρεσιακό έντυπο'), template.name + ' must explain provisional status');
  const parts = getTemplateParts(template);
  assert.ok(parts['word/document.xml'], template.name + ' must contain document.xml');
  assert.ok(parts['word/styles.xml'], template.name + ' must include styles.xml');
  assert.ok(parts['word/_rels/document.xml.rels'], template.name + ' must link styles.xml');
  let xml = strFromU8(parts['word/document.xml']);
  assert.doesNotMatch(xml, /ΠΡΟΣΟΧΗ: Το παρόν είναι ανωνυμοποιημένο πρότυπο/u, 'Provisional warning must not be printed in the document');
  xml = replaceInXml(xml, template, syntheticCase);
  assert.doesNotMatch(xml, /\{\{\s*[\p{L}\p{N}_.-]+\s*\}\}/, template.name + ' must not retain placeholders');

  if (['commerce-01', 'commerce-05', 'commerce-07'].includes(template.id)) {
    assert.ok(xml.includes('ACTOR-A-FULL-NAME'), template.name + ' must contain actor A');
    assert.ok(!xml.includes('ACTOR-B-FULL-NAME'), template.name + ' must not contain actor B');
  }
  if (['commerce-02', 'commerce-06', 'commerce-08'].includes(template.id)) {
    assert.ok(xml.includes('ACTOR-B-FULL-NAME'), template.name + ' must contain actor B');
    assert.ok(!xml.includes('ACTOR-A-FULL-NAME'), template.name + ' must not contain actor A');
  }
  const archive = zipSync({ ...parts, 'word/document.xml': strToU8(xml) });
  assert.ok(unzipSync(archive)['word/document.xml'], template.name + ' must remain a readable DOCX archive');
}

const workspaceSource = await readFile(new URL('../case-folder-storage.js', import.meta.url), 'utf8');
const hypothesesSource = await readFile(new URL('../hypotheses.js', import.meta.url), 'utf8');
assert.match(workspaceSource, /async function readDocument\(caseId, fileName\)/);
assert.match(workspaceSource, /readDocument: readDocument/);
assert.match(hypothesesSource, /Άνοιγμα \/ λήψη/);
assert.match(hypothesesSource, /window\.AXYP_WORKSPACE\.readDocument/);
assert.doesNotMatch(hypothesesSource, /Προεπισκόπηση: /);
assert.doesNotMatch(hypothesesSource, /Αποθηκευμένο έγγραφο: /);

const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
assert.match(serviceWorker, /const CACHE_NAME = \"axyp-dev\";/, "Source service worker must use the build placeholder");
assert.ok(serviceWorker.includes('./paremporio-templates.js'), 'Commerce template module must be available offline');

console.log('Commerce dossier mapping and document-access tests passed.');
