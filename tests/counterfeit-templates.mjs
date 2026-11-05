import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync, zipSync, strFromU8, strToU8 } from '../vendor/fflate.js';
import { DEFAULT_COUNTERFEIT_TEMPLATES } from '../dossier-templates-data.js';
import { ensureDefaultTemplates, initializeDefaultTemplates, getTemplateParts, computeTimeline, replaceInXml, valueFor } from '../template-library.js';

console.log('--- Starting Counterfeit Templates & Auto-loader Test Suite ---');

// Helper mock storage
function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    dump: () => Object.fromEntries(store.entries())
  };
}

// 1. Test first install (clean install without previous data)
console.log('1. Testing first install on clean storage...');
const storage1 = createMockStorage();
assert.equal(storage1.getItem('axyp-docx-templates'), null);

ensureDefaultTemplates(storage1);

const seededTemplates = JSON.parse(storage1.getItem('axyp-docx-templates'));

assert.equal(storage1.getItem('axyp-counterfeit-templates-seeded-v1'), 'true');
const counterfeitSeeded = seededTemplates.filter((t) => t.category === 'counterfeit');
assert.equal(counterfeitSeeded.length, 5, 'Expected exactly 5 seeded counterfeit templates');
for (const id of ['counterfeit-01', 'counterfeit-02', 'counterfeit-03']) {
  const template = counterfeitSeeded.find((item) => item.id === id);
  assert.ok(template.fields.includes('evidence.serialNumber'), id + ' declares the serial-number field');
  assert.equal(template.mappings['evidence.serialNumber'], 'evidence.serialNumber');
  const parts = getTemplateParts(template);
  const xml = strFromU8(parts['word/document.xml']);
  assert.match(xml, /Σειριακός αριθμός πλαστού χαρτονομίσματος:/);
  assert.match(xml, /\\{\\{evidence\\.serialNumber\\}\\}/);
}

const expectedNames = [
  '01_ΕΚΘΕΣΗ_ΕΝΟΡΚΗΣ_ΕΞΕΤΑΣΗΣ_ΜΑΡΤΥΡΑ.docx',
  '02_ΕΚΘΕΣΗ_ΠΑΡΑΔΟΣΕΩΣ_ΚΑΙ_ΚΑΤΑΣΧΕΣΕΩΣ.docx',
  '03_ΕΝΤΥΠΟ_ΣΤΑ_ΕΓΚΛΗΜΑΤΟΛΟΓΙΚΑ_ΕΡΓΑΣΤΗΡΙΑ.docx',
  '04_ΔΙΑΒΙΒΑΣΤΙΚΟ_ΔΕΕ.docx',
  '05_ΔΙΑΒΙΒΑΣΤΙΚΟ_ΕΙΣΑΓΓΕΛΙΑΣ.docx'
];

expectedNames.forEach((expectedName) => {
  const found = counterfeitSeeded.find((t) => t.name === expectedName);
  assert.ok(found, `Template ${expectedName} must be seeded`);
  assert.ok(found.dataBase64, 'Template must have dataBase64');
  assert.ok(found.mappings, 'Template must have mappings');
  assert.ok(found.mappingConfirmedAt, 'Template mappingConfirmedAt must be pre-confirmed');
  assert.equal(found.category, 'counterfeit');
});
console.log('✓ Clean installation seeded 5 counterfeit templates successfully.');

// 1b. Test that seeding waits for IndexedDB hydration before reading or writing templates.
console.log('1b. Testing delayed IndexedDB hydration...');
const delayedStorage = createMockStorage();
let finishHydration;
delayedStorage.ready = new Promise((resolve) => { finishHydration = resolve; });
const delayedInitialization = initializeDefaultTemplates(delayedStorage);
assert.equal(delayedStorage.getItem('axyp-docx-templates'), null, 'Seeding must not run before storage hydration');
const hydratedExisting = [{
  id: 'existing-user-template',
  name: 'CUSTOM_EXISTING.docx',
  category: 'custom',
  fields: [],
  mappings: { retained: true }
}];
delayedStorage.setItem('axyp-docx-templates', JSON.stringify(hydratedExisting));
delayedStorage.setItem('axyp-narcotics-templates-seeded-v1', 'true');
delayedStorage.setItem('axyp-counterfeit-templates-seeded-v1', 'true');
finishHydration();
await delayedInitialization;
assert.deepEqual(
  JSON.parse(delayedStorage.getItem('axyp-docx-templates')),
  hydratedExisting,
  'Hydrated existing templates must remain untouched'
);
console.log('✓ Default seeding waits for storage hydration and preserves hydrated data.');

// 2. Test second launch / re-initialization (no duplicates)
console.log('2. Testing second launch (zero duplicates)...');
ensureDefaultTemplates(storage1);

const recheckedTemplates = JSON.parse(storage1.getItem('axyp-docx-templates'));
const recheckedCounterfeit = recheckedTemplates.filter((t) => t.category === 'counterfeit');
assert.equal(recheckedCounterfeit.length, 5, 'Must remain 5 counterfeit templates without duplication');

// Test deletion respect: if user deletes a template, it must not be re-added on next boot
const withoutFirstCounterfeit = recheckedTemplates.filter((t) => t.id !== 'counterfeit-01');
storage1.setItem('axyp-docx-templates', JSON.stringify(withoutFirstCounterfeit));

ensureDefaultTemplates(storage1);
const afterReboot = JSON.parse(storage1.getItem('axyp-docx-templates'));
assert.equal(afterReboot.some((t) => t.id === 'counterfeit-01'), false, 'Deleted counterfeit template must not be restored');
console.log('✓ Second launch creates zero duplicates and respects user deletions.');

// 3. Test upgrade of existing installation where narcotics is already seeded
console.log('3. Testing upgrade of existing narcotics installation...');
const storageUpgrade = createMockStorage({
  'axyp-narcotics-templates-seeded-v1': 'true',
  'axyp-docx-templates': JSON.stringify([
    {
      id: 'narcotics-01',
      name: '01_ΚΑΤΑΘΕΣΗ_ΜΑΡΤΥΡΑ.docx',
      category: 'narcotics',
      customUserNote: 'user modified version',
      mappings: { 'case.date': 'custom.date' }
    },
    {
      id: 'custom-tpl-99',
      name: 'CUSTOM_REPORT.docx',
      category: 'traffic',
      fields: ['case.title'],
      mappings: { 'case.title': 'case.title' }
    }
  ])
});

ensureDefaultTemplates(storageUpgrade);
const upgradedTemplates = JSON.parse(storageUpgrade.getItem('axyp-docx-templates'));
assert.equal(storageUpgrade.getItem('axyp-counterfeit-templates-seeded-v1'), 'true');

// The custom template must still be there
const customFound = upgradedTemplates.find((t) => t.id === 'custom-tpl-99');
assert.ok(customFound, 'Custom template must be retained');

// The pre-existing narcotics template must NOT be overwritten
const existingNarcotics = upgradedTemplates.find((t) => t.id === 'narcotics-01');
assert.equal(existingNarcotics.customUserNote, 'user modified version', 'User modifications must not be overwritten');

// All 5 counterfeit templates must have been added
const addedCounterfeit = upgradedTemplates.filter((t) => t.category === 'counterfeit');
assert.equal(addedCounterfeit.length, 5, 'Expected 5 counterfeit templates added on upgrade');
console.log('✓ Upgrade preserves custom templates and user modifications while seeding counterfeit templates.');

// 4. Test offline & local-first integrity
console.log('4. Testing offline and local-first architecture...');
const storageSource = await readFile(new URL('../storage.js', import.meta.url), 'utf8');
assert.match(storageSource, /axyp-counterfeit-templates-seeded-v1/, 'Counterfeit seed marker must be in KNOWN_KEYS');

const swSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
assert.ok(swSource.includes('./dossier-templates-data.js'), 'sw.js must cache dossier-templates-data.js');
assert.ok(swSource.includes('./dossier-categories.js'), 'sw.js must cache dossier-categories.js');
console.log('✓ Offline cache and local-first requirements fully verified.');

// 5. Test that all 5 counterfeit DOCX files unpack and replace placeholders with synthetic data
console.log('5. Testing unpacking and placeholder replacement across all 5 counterfeit DOCX templates...');
const syntheticCase = {
  id: 'yp-counterfeit-test-01',
  title: 'Δικογραφία Πλαστών (Δοκιμή)',
  protocolNumber: '1020/2/99-α',
  prosecutor: 'Εισαγγελία Πρωτοδικών Μεσσηνίας',
  date: '2026-11-05',
  time: '11:40',
  location: 'Κυπαρισσία',
  evidence: 'ένα (1) χαρτονόμισμα των πενήντα (50) ευρώ',
  counterfeit: { serialNumber: 'TEST-SERIAL-123456' },
  arrestingOfficer: 'Υπαστυνόμος Β΄ Παπαδόπουλος Γεώργιος',
  officerA: {
    rank: 'Υπαστυνόμος Β΄',
    surname: 'Παπαδόπουλος',
    name: 'Γεώργιος',
    service: 'Α.Τ. Τριφυλίας'
  },
  officerB: {
    rank: 'Αρχιφύλακας',
    surname: 'Γεωργίου',
    name: 'Ιωάννης',
    service: 'Α.Τ. Τριφυλίας'
  },
  offender: {
    surname: 'Δοκιμαστικός',
    name: 'Νικόλαος',
    fatherName: 'Κωνσταντίνου',
    motherName: 'Ελένης',
    birthDate: '1990-01-01',
    birthPlace: 'Καλαμάτα',
    city: 'Κυπαρισσία',
    address: 'Ελ. Βενιζέλου 10',
    idNumber: 'ΑΒ123456',
    idDate: '2015-05-10',
    idService: 'Α.Τ. Καλαμάτας',
    taxId: '012345678',
    email: 'test@example.com'
  },
  timeline: computeTimeline('11:40')
};

for (const tpl of DEFAULT_COUNTERFEIT_TEMPLATES) {
  const parts = getTemplateParts(tpl);
  assert.ok(parts['word/document.xml'], `Template ${tpl.name} must contain word/document.xml`);
  
  // Verify placeholders extraction
  assert.ok(tpl.fields.length > 0, `Template ${tpl.name} must have extracted fields`);
  
  let foundDocument = false;
  for (const filename of Object.keys(parts)) {
    if (!filename.startsWith('word/') || !filename.endsWith('.xml')) continue;
    let xml = strFromU8(parts[filename]);
    if (filename === 'word/document.xml') foundDocument = true;
    xml = replaceInXml(xml, tpl, syntheticCase);
    if (['counterfeit-01', 'counterfeit-02', 'counterfeit-03'].includes(tpl.id)) {
      assert.ok(xml.includes('TEST-SERIAL-123456'), tpl.name + ' must repeat the serial number');
    }
    assert.doesNotMatch(xml, /\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/, `All placeholders in ${tpl.name} (${filename}) should be filled`);
    parts[filename] = strToU8(xml);
  }
  assert.ok(foundDocument, `Template ${tpl.name} must contain the main document`);
  
  // Pack back to docx
  const zipped = zipSync(parts);
  assert.ok(zipped.length > 1000, `Re-zipped docx for ${tpl.name} must be valid`);
  
  // Unpack again to confirm validity
  const reopened = unzipSync(zipped);
  assert.ok(reopened['word/document.xml'], `Reopened docx for ${tpl.name} must be valid`);
  console.log(`  ✓ ${tpl.name}: successfully verified (${tpl.fields.length} placeholders).`);
}

console.log('\nAll 5 counterfeit test suites passed with 100% success!');
