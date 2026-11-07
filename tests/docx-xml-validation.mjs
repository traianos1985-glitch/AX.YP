import { buildDocx, ensureDefaultTemplates, loadBuiltinTemplateData } from '../template-library.js';
import { unzipSync } from '../vendor/fflate.js';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

const xmllintCheck = spawnSync('which', ['xmllint']);
if (xmllintCheck.status !== 0) {
  throw new Error('H4 requires xmllint; install libxml2-utils before running DOCX XML validation.');
}
const hasXmllint = true;
const sofficeCheck = spawnSync('which', ['soffice']);
if (sofficeCheck.status !== 0) {
  throw new Error('H4 requires LibreOffice (soffice); install libreoffice before running DOCX validation.');
}
console.log('xmllint and LibreOffice detected: strict parser and PDF conversion enabled.');

let totalXmlPartsChecked = 0;
const conversionDir = await mkdtemp(join(tmpdir(), 'axyp-docx-validation-'));

for (const t of templates) {
  const docxBytes = buildDocx(t, mockCase);
  const unzipped = unzipSync(docxBytes);
  const docXml = new TextDecoder().decode(unzipped['word/document.xml']);
  const docxPath = join(conversionDir, `${t.id}.docx`);
  await writeFile(docxPath, docxBytes);
  const pdfResult = spawnSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', conversionDir, docxPath], { encoding: 'utf8' });
  if (pdfResult.status !== 0) {
    throw new Error(`LibreOffice conversion failed for ${t.id}: ${pdfResult.stderr || pdfResult.stdout}`);
  }
  const pdfPath = join(conversionDir, `${t.id}.pdf`);
  try { await readFile(pdfPath); } catch (error) { throw new Error(`LibreOffice did not produce a PDF for ${t.id}: ${error.message}`); }

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

  const visibleTextResult = spawnSync('xmllint', ['--xpath', '//*[local-name()="t"]/text()', '-'], { input: Buffer.from(docXml), encoding: 'utf8' });
  if (visibleTextResult.status !== 0) {
    throw new Error(`Could not extract parsed visible text for ${t.id}: ${visibleTextResult.stderr}`);
  }
  const visibleText = visibleTextResult.stdout || '';
  if (/\{\{[^}]+\}\}/u.test(visibleText)) {
    throw new Error(`Unresolved placeholder remains in visible text for ${t.id}`);
  }
  if (/\d{4}-\d{2}-\d{2}/u.test(visibleText)) {
    throw new Error(`ISO date remains in visible text for ${t.id}: ${visibleText}`);
  }
}

await rm(conversionDir, { recursive: true, force: true });
console.log(`✓ All 39 templates passed parsed XML, visible-text, placeholder, date, PDF conversion and escaping checks (${totalXmlPartsChecked} XML/RELS parts validated with xmllint).`);
