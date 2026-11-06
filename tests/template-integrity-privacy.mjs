import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { getMissingTemplateFields } from '../template-library.js';

globalThis.window = {
  AXYP_SERVICE_PROFILE: { get: () => ({}) }
};

const root = path.resolve('templates');
const docxFiles = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.docx')) docxFiles.push(absolute);
  }
}

await walk(root);
assert.ok(docxFiles.length > 0, 'At least one built-in DOCX template must be checked');

const failures = [];
const placeholderPattern = /\{\{\s*([\p{L}\p{N}_.-]+)\s*\}\}/gu;
const personalDataPatterns = [
  { label: 'πιθανός 9ψήφιος ΑΦΜ', pattern: /\b\d{9}\b/u },
  { label: 'διεύθυνση email', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu },
  { label: 'αναφορά στην Τριφυλία', pattern: /τριφυλ/iu },
  { label: 'αναφορά στην Κυπαρισσία', pattern: /κυπαρισσ/iu }
];

function decodeXml(value) {
  return value
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'");
}

for (const file of docxFiles) {
  const relative = path.relative(process.cwd(), file).split(path.sep).join('/');
  try {
    const bytes = new Uint8Array(await readFile(file));
    const archive = unzipSync(bytes);
    const xmlEntries = Object.entries(archive)
      .filter(([name]) => name.startsWith('word/') && name.endsWith('.xml'));
    const visibleText = xmlEntries.map(([name, data]) => {
      const xml = strFromU8(data);
      return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gu)]
        .map((match) => decodeXml(match[1]))
        .join('');
    }).join('\n');

    const placeholders = [...new Set([...visibleText.matchAll(placeholderPattern)].map((match) => match[1]))];
    for (const field of placeholders) {
      const issues = getMissingTemplateFields({ fields: [field] }, {});
      if (issues.some((issue) => issue.reason === 'δεν έχει αντιστοιχιστεί')) {
        failures.push(`${relative}: placeholder χωρίς γνωστή αντιστοίχιση {{${field}}}`);
      }
    }

    for (const check of personalDataPatterns) {
      if (check.pattern.test(visibleText)) failures.push(`${relative}: ${check.label}`);
    }

    if (/[ \t]{2,}/u.test(visibleText)) failures.push(`${relative}: διπλά συνεχόμενα κενά`);
    if (/[ \t]+[.,;:!?…]/u.test(visibleText)) failures.push(`${relative}: κενό πριν από σημείο στίξης`);
  } catch (error) {
    failures.push(`${relative}: μη αναγνώσιμο DOCX (${error.message})`);
  }
}

assert.deepEqual(failures, [], `Έλεγχοι ακεραιότητας προτύπων απέτυχαν:\\n${failures.join('\\n')}`);
console.log(`Template integrity/privacy tests passed: ${docxFiles.length} DOCX templates checked.`);
