import { buildDocx, ensureDefaultTemplates, loadBuiltinTemplateData } from '../template-library.js';
import { unzipSync } from '../vendor/fflate.js';

console.log('--- Testing DOCX XML Validity & Entity Escaping Regressions ---');

const storage = {
  data: {},
  getItem(k) { return this.data[k] || null; },
  setItem(k, v) { this.data[k] = v; }
};

await loadBuiltinTemplateData();
await ensureDefaultTemplates(storage);
const templates = JSON.parse(storage.getItem('axyp-docx-templates') || '[]');

if (templates.length !== 39) {
  throw new Error(`Expected 39 templates, found ${templates.length}`);
}

const mockCase = {
  id: 'case-test-regression',
  title: 'Υπόθεση Ελέγχου XML',
  date: '2026-11-05',
  time: '12:00',
  location: 'Αθήνα'
};

for (const t of templates) {
  const docxBytes = buildDocx(t, mockCase);
  const unzipped = unzipSync(docxBytes);
  const docXml = new TextDecoder().decode(unzipped['word/document.xml']);

  // Check C1: No duplicate xmlns:r on root tag
  const rootMatch = docXml.match(/<w:document\b[^>]*>/);
  if (!rootMatch) {
    throw new Error(`Missing <w:document> root tag in ${t.name}`);
  }
  const rootTag = rootMatch[0];
  const xmlnsRCount = (rootTag.match(/\bxmlns:r=/g) || []).length;
  if (xmlnsRCount > 1) {
    throw new Error(`C1 Regression: Duplicate xmlns:r found in root tag of ${t.name} (count: ${xmlnsRCount})`);
  }

  // Check C2: No double escaping like &amp;apos; or &amp;amp;
  for (const [partPath, bytes] of Object.entries(unzipped)) {
    if (partPath.endsWith('.xml')) {
      const xml = new TextDecoder().decode(bytes);
      const invalidEscaping = xml.match(/&amp;(?:apos|amp|quot|lt|gt);/g);
      if (invalidEscaping) {
        throw new Error(`C2 Regression: Double-escaped entity in ${t.name} (${partPath}): ${invalidEscaping.join(', ')}`);
      }
    }
  }
}

console.log('✓ All 39 templates passed XML root attributes and entity escaping regression tests.');
