import assert from 'node:assert/strict';
import { correctOfficerServicePlaceholders, normalizeGreekDocxXml, replaceInXml } from '../template-library.js';

const source = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>ενώπιιον κατηγορούμενου κρατούμενου επισκέψείς ποιά σηματική αναφορά μας Yποβολή Β’  λέξη , κείμενο . Ταυτότητος</w:t></w:r></w:p></w:document>';
const normalized = normalizeGreekDocxXml(source);
for (const expected of ['ενώπιον', 'κατηγορουμένου', 'κρατουμένου', 'επισκέψεις', 'ποια', 'σχετική αναφορά μας', 'Υποβολή', 'Β΄', 'λέξη,', 'κείμενο.', 'Ταυτότητος']) {
  assert.ok(normalized.includes(expected), 'Expected normalized text: ' + expected);
}
assert.doesNotMatch(normalized, /ενώπιιον|κατηγορούμενου|κρατούμενου|επισκέψείς|ποιά|σηματική αναφορά μας|Yποβολή|Β’|λέξη ,|κείμενο \./u);

const originalMapping = '<w:t>Στοιχεία υπαλλήλου, κατοίκων {{officerA.service}}</w:t><w:t>κατ. {{officerA.service}}</w:t>';
const corrected = correctOfficerServicePlaceholders(originalMapping);
assert.equal((corrected.match(/officerB\.service/g) || []).length, 2);
assert.doesNotMatch(corrected, /officerA\.service/u);
const populated = replaceInXml(corrected, { mappings: { 'officerB.service': 'officerB.service' } }, {
  officerB: { service: 'TEST-OFFICER-B-SERVICE' }
});
assert.equal((populated.match(/TEST-OFFICER-B-SERVICE/g) || []).length, 2);

console.log('DOCX Greek text normalization and investigator-service mapping tests passed.');
