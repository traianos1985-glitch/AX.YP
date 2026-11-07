import assert from 'node:assert/strict';
import { anonymizeDocxParts, detectDocxPersonalData } from '../docx-anonymization.js';

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>Ονοματεπώνυμο: </w:t></w:r><w:r><w:t>ΜΑΡΙΑ ΠΑΠΑΔΟΠΟΥΛΟΥ</w:t></w:r></w:p>
<w:p><w:r><w:t>Α.Φ.Μ.: 123456789</w:t></w:r></w:p>
<w:p><w:r><w:t>Α.Δ.Τ.: ΑΒ123456</w:t></w:r></w:p>
<w:p><w:r><w:t>Τηλέφωνο: 6912345678</w:t></w:r></w:p>
<w:p><w:r><w:t>Όχημα με αριθμό ΑΒΕ 1234</w:t></w:r></w:p>
<w:p><w:r><w:t>Email: test@example.gr</w:t></w:r></w:p>
</w:body></w:document>`;
const originalBytes = new TextEncoder().encode(xml);
const parts = { 'word/document.xml': originalBytes };
const candidates = detectDocxPersonalData(parts);
assert.equal(candidates.length, 6, 'Should detect six synthetic personal-data examples');
const approved = candidates.filter((candidate) => candidate.category !== 'full-name');
const anonymized = anonymizeDocxParts(parts, approved);
const output = new TextDecoder().decode(anonymized['word/document.xml']);
assert.ok(output.includes('{{person.taxId}}'));
assert.ok(output.includes('{{person.idNumber}}'));
assert.ok(output.includes('{{person.phone}}'));
assert.ok(output.includes('{{vehicle.plate}}'));
assert.ok(output.includes('{{person.email}}'));
assert.ok(output.includes('ΜΑΡΙΑ ΠΑΠΑΔΟΠΟΥΛΟΥ'), 'Unapproved name suggestion must remain unchanged');
assert.ok(!output.includes('123456789'));
assert.ok(!output.includes('6912345678'));
assert.ok(!output.includes('ΑΒΕ 1234'));
assert.ok(!output.includes('test@example.gr'));
assert.deepEqual(parts['word/document.xml'], originalBytes, 'The input bytes must remain untouched');
const splitRunXml = '<w:p><w:r><w:t>Ονοματεπώνυμο: ΜΑΡΙΑ </w:t></w:r><w:r><w:t>ΠΑΠΑΔΟΠΟΥΛΟΥ</w:t></w:r></w:p>';
const splitParts = { 'word/document.xml': new TextEncoder().encode(splitRunXml) };
const splitCandidate = detectDocxPersonalData(splitParts).find((candidate) => candidate.category === 'full-name');
assert.ok(splitCandidate, 'Should detect a labelled full name split across Word runs');
const splitOutput = new TextDecoder().decode(anonymizeDocxParts(splitParts, [splitCandidate])['word/document.xml']);
assert.ok(splitOutput.includes('{{person.fullName}}'), 'Replacement must work across Word runs');
console.log('DOCX anonymization tests passed.');
