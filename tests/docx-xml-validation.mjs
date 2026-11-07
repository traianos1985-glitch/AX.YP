import { buildDocx, ensureDefaultTemplates, loadBuiltinTemplateData } from '../template-library.js';
import { unzipSync } from '../vendor/fflate.js';
import { spawnSync } from 'node:child_process';

console.log('--- Testing DOCX XML Validity, Entity Escaping & XML Parsing (H4) ---');

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
  incidentDate: '2026-11-04',
  incidentTime: '23:30',
  location: 'Αθήνα'
};

// Check if xmllint is available in the environment
const hasXmllint = spawnSync('which', ['xmllint']).status === 0;
if (hasXmllint) {
  console.log('xmllint detected: full strict XML parser validation enabled.');
}

let totalXmlPartsChecked = 0;

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
    if (partPath.endsWith('.xml') || partPath.endsWith('.rels')) {
      totalXmlPartsChecked++;
      const xml = new TextDecoder().decode(bytes);
      const invalidEscaping = xml.match(/&amp;(?:apos|amp|quot|lt|gt);/g);
      if (invalidEscaping) {
        throw new Error(`C2 Regression: Double-escaped entity in ${t.name} (${partPath}): ${invalidEscaping.join(', ')}`);
      }

      // Strict XML parser validation via xmllint if available
      if (hasXmllint) {
        const res = spawnSync('xmllint', ['--noout', '-'], { input: bytes, encoding: 'buffer' });
        if (res.status !== 0) {
          const errMsg = res.stderr ? res.stderr.toString('utf8') : 'XML parse error';
          throw new Error(`H4 XML Validation Error in ${t.name} (${partPath}): ${errMsg}`);
        }
      }
    }
  }
}

console.log(`✓ All 39 templates passed XML root attributes and entity escaping regression tests (${totalXmlPartsChecked} XML/RELS parts validated${hasXmllint ? ' with xmllint' : ''}).`);
