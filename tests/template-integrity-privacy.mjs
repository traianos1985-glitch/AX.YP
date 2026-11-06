import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import {
  buildDocx,
  ensureDefaultTemplates,
  getMissingTemplateFields,
  getTemplateParts
} from '../template-library.js';

const values = new Map();
const memoryStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); }
};

globalThis.window = {
  AXYP_STORAGE: memoryStorage,
  AXYP_SERVICE_PROFILE: { get: () => ({}) }
};

const TEMPLATE_STORAGE_KEY = 'axyp-docx-templates';
await ensureDefaultTemplates(memoryStorage);
const templates = JSON.parse(memoryStorage.getItem(TEMPLATE_STORAGE_KEY) || '[]');
assert.ok(templates.length > 0, 'At least one built-in DOCX template must be checked');

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

function visibleParagraphs(xml) {
  return [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/gu)].map((paragraph) =>
    [...paragraph[1].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gu)]
      .map((match) => decodeXml(match[1]))
      .join('')
  );
}

function excerptAround(text, pattern, radius = 70) {
  const match = pattern.exec(text);
  if (!match) return '';
  const start = Math.max(0, match.index - radius);
  const end = Math.min(text.length, match.index + match[0].length + radius);
  return JSON.stringify(text.slice(start, end));
}

function visibleTextRuns(xml) {
  return [...xml.matchAll(/<w:t\\b[^>]*>([\\s\\S]*?)<\\/w:t>/gu)]
    .map((match) => decodeXml(match[1]));
}

function readWordParts(parts) {
  return Object.entries(parts)
    .filter(([name]) => name.startsWith('word/') && name.endsWith('.xml'))
    .map(([name, data]) => ({
      name,
      paragraphs: visibleParagraphs(strFromU8(data))
    }));
}

const testCase = {
  id: 'axyp-template-integrity-test',
  title: 'Δοκιμαστική υπόθεση',
  date: '2026-11-06',
  location: 'έδρα της Υπηρεσίας',
  time: '10:00',
  service: {},
  case: {},
  person: {},
  officerA: {},
  officerB: {}
};

for (const template of templates) {
  const label = template.id || template.name || 'άγνωστο πρότυπο';
  try {
    const sourceParts = getTemplateParts(template);
    const sourceWordParts = readWordParts(sourceParts);
    const sourceText = sourceWordParts.flatMap((part) => part.paragraphs).join('\n');

    const placeholders = [...new Set([...sourceText.matchAll(placeholderPattern)].map((match) => match[1]))];
    for (const field of placeholders) {
      const issues = getMissingTemplateFields({ fields: [field] }, {});
      if (issues.some((issue) => issue.reason === 'δεν έχει αντιστοιχιστεί')) {
        failures.push(`${label}: placeholder χωρίς γνωστή αντιστοίχιση {{${field}}}`);
      }
    }

    // Test the actual DOCX produced by the same production pipeline used for downloads.
    const generated = buildDocx(template, testCase);
    const generatedParts = unzipSync(generated);
    const generatedWordParts = readWordParts(generatedParts);
    const generatedText = generatedWordParts.flatMap((part) => part.paragraphs).join('\n');

    for (const check of personalDataPatterns) {
      if (check.pattern.test(generatedText)) failures.push(`${label}: ${check.label} στο παραγόμενο DOCX — ${excerptAround(generatedText, check.pattern)}`);
    }

    for (const part of generatedWordParts) {
      const runs = visibleTextRuns(strFromU8(generatedParts[part.name]));
      for (const run of runs) {
        if (/ {2,}/u.test(run)) {
          failures.push(`${label} (${part.name}): διπλά συνεχόμενα κενά σε κείμενο Word — ${JSON.stringify(run)}`);
          break;
        }
        if (/ +[.,;:!?…]/u.test(run)) {
          failures.push(`${label} (${part.name}): κενό πριν από σημείο στίξης σε κείμενο Word — ${JSON.stringify(run)}`);
          break;
        }
      }
    }
  } catch (error) {
    failures.push(`${label}: μη αναγνώσιμο ή μη παραγόμενο DOCX (${error.message})`);
  }
}

assert.deepEqual(failures, [], `Έλεγχοι ακεραιότητας/privacy προτύπων απέτυχαν:\n${failures.join('\n')}`);
console.log(`Template integrity/privacy tests passed: ${templates.length} built-in DOCX templates checked.`);
