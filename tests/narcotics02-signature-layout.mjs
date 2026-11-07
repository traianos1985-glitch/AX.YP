import assert from 'node:assert/strict';
import { DEFAULT_NARCOTICS_TEMPLATES } from '../dossier-templates-data.js';
import { buildDocx } from '../template-library.js';
import { unzipSync, strFromU8 } from '../vendor/fflate.js';

const template = DEFAULT_NARCOTICS_TEMPLATES.find((entry) => entry.id === 'narcotics-02');

// Investigator A is installation-owned; legacy case officerA values below must not override it.
globalThis.window = {
  AXYP_SERVICE_PROFILE: {
    get: () => ({
      name: 'TEST-SERVICE-A',
      operator: 'TEST-Rank TEST-SURNAME-A TestNameA',
      operatorDocument: 'TEST-OFFICER-A-GENITIVE'
    })
  }
};
assert.ok(template, 'narcotics-02 source template must exist');

const syntheticCase = {
  id: 'narcotics-02-signature-layout-test',
  profile: 'narcotics',
  title: 'TEST-CASE',
  date: '2026-11-06',
  time: '10:00',
  location: 'TEST-LOCATION',
  arrestingOfficer: 'TEST-ARRESTING-OFFICER',
  // New-case fixture: A investigator must come from the installation profile above.
  officerB: { rank: 'TEST-RANK-B', surname: 'TEST-SURNAME-B', name: 'TEST-NAME-B', service: 'TEST-SERVICE-B' },
  offender: { surname: 'TEST-PERSON-SURNAME', name: 'TEST-PERSON-NAME', fatherName: 'TEST-FATHER', motherName: 'TEST-MOTHER' },
  timeline: { arrestStartTime: '10:06', arrestEndTime: '10:11' }
};

const parts = unzipSync(buildDocx(template, syntheticCase));
const xml = strFromU8(parts['word/document.xml']);
const tables = [...xml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/gu)].map((match) => match[0]);
assert.equal(tables.length, 2, 'Generated arrest form must retain its header table and one signature table');
const signatureTable = tables[1];
for (const value of [
  'TEST-ARRESTING-OFFICER',
  'TEST-PERSON-SURNAME TEST-PERSON-NAME',
  'TEST-RANK-B TEST-SURNAME-B TEST-NAME-B',
  'TEST-Rank TEST-SURNAME-A TestNameA'
]) {
  assert.ok(signatureTable.includes(value), `Signature table must include ${value}`);
}
assert.ok(signatureTable.includes('Ο Συλλαβών') && signatureTable.includes('Ο Συλληφθείς'));
assert.ok(signatureTable.includes('Ο Β΄ Ανακριτικός Υπάλληλος') && signatureTable.includes('Ο Α΄ Ανακριτικός Υπάλληλος'));

const signatureEnd = xml.indexOf(signatureTable) + signatureTable.length;
const tail = xml.slice(signatureEnd);
const nextParagraph = tail.match(/<w:p\b[\s\S]*?<\/w:p>/u);
if (nextParagraph) {
  const text = nextParagraph[0].replace(/<[^>]+>/gu, '').replace(/&amp;/gu, '&').trim();
  const dotRuns = text.match(/[.·…_]{3,}/gu) || [];
  assert.ok(
    !(/^[.·…_\s]+$/u.test(text) && dotRuns.length >= 3),
    'Old dotted signature line must not remain after the replacement table'
  );
}
assert.doesNotMatch(xml, /\{\{\s*[\p{L}\p{N}_.-]+\s*\}\}/u, 'Generated signature document must not retain unresolved placeholders');

console.log('Narcotics-02 signature table layout regression passed.');
