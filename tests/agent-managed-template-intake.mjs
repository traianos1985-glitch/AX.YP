import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, library, readme] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../template-library.js', import.meta.url), 'utf8'),
  readFile(new URL('../README.md', import.meta.url), 'utf8')
]);

// New official dossier documents are prepared and reviewed by a coding agent,
// then delivered through a repository PR. The runtime app must not anonymize
// or import original case documents.
assert.doesNotMatch(html, /id=["']template-file["']/u);
assert.doesNotMatch(html, /id=["']template-category["']/u);
assert.doesNotMatch(html, /Ανέβασμα αυθεντικού εντύπου Word/u);
assert.doesNotMatch(html, /DOCX που ανεβάζει ο χρήστης/u);
assert.match(html, /προετοιμάζονται από εξουσιοδοτημένο coding agent/u);
assert.match(html, /Δεν γίνεται εισαγωγή ή ανωνυμοποίηση εγγράφων από αυτό το περιβάλλον/u);

assert.doesNotMatch(library, /reviewAnonymizationCandidates/u);
assert.doesNotMatch(library, /async function importTemplate/u);
assert.doesNotMatch(library, /template-file/u);
assert.doesNotMatch(library, /Αποθήκευση διορθωμένης έκδοσης/u);
assert.doesNotMatch(library, /Λήψη εντύπου για διόρθωση στο Word/u);
assert.doesNotMatch(library, /Εξαγωγή επίσημου πακέτου για δημοσίευση/u);

// The offline/agent-side DOCX transformation engine remains available and tested.
const anonymization = await readFile(new URL('../docx-anonymization.js', import.meta.url), 'utf8');
assert.match(anonymization, /detectDottedPlaceholderCandidates/u);
assert.match(anonymization, /anonymizeDocxParts/u);
assert.match(readme, /προετοιμάζονται εκτός εφαρμογής από εξουσιοδοτημένο coding agent/u);
assert.match(readme, /μέσω PR/u);

console.log('Agent-managed template intake boundary checks passed.');
