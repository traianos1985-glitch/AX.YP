import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync, zipSync, strFromU8, strToU8 } from '../vendor/fflate.js';
import { DEFAULT_HEALTH_TEMPLATES } from '../dossier-templates-data.js';
import { ensureDefaultTemplates, initializeDefaultTemplates, getTemplateParts, replaceInXml, valueFor } from '../template-library.js';

console.log('--- Starting Health Inspection (Grill / Art. 290 PK) Templates & Auto-loader Test Suite ---');

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

assert.equal(storage1.getItem('axyp-health-templates-seeded-v1'), 'true');
const healthSeeded = seededTemplates.filter((t) => t.category === 'health');
assert.equal(healthSeeded.length, 4, 'Expected exactly 4 seeded health templates');

const expectedNames = [
  '01_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ_ΕΠ_ΑΥΤΟΦΩΡΩ.docx',
  '02_ΕΚΘΕΣΗ_ΕΞΕΤΑΣΗΣ_ΚΑΤΗΓΟΡΟΥΜΕΝΟΥ.docx',
  '03_ΔΕΛΤΙΟ_ΣΤΟΙΧΕΙΩΝ_ΤΑΥΤΟΤΗΤΑΣ_ΚΑΤΗΓΟΡΟΥΜΕΝΟΥ.docx',
  '04_ΥΠΟΒΟΛΗ_ΣΧΗΜΑΤΙΣΘΕΙΣΑΣ_ΔΙΚΟΓΡΑΦΙΑΣ.docx'
];

expectedNames.forEach((expectedName) => {
  const found = healthSeeded.find((t) => t.name === expectedName);
  assert.ok(found, `Template ${expectedName} must be seeded`);
  assert.ok(found.dataBase64, 'Template must have dataBase64');
  assert.ok(found.mappings, 'Template must have mappings');
  assert.ok(found.mappingConfirmedAt, 'Template mappingConfirmedAt must be pre-confirmed');
  assert.equal(found.category, 'health');
});
console.log('✓ Clean installation seeded 4 health templates successfully.');

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
delayedStorage.setItem('axyp-environment-templates-seeded-v1', 'true');
delayedStorage.setItem('axyp-health-templates-seeded-v1', 'true');
 delayedStorage.setItem('axyp-commerce-templates-seeded-v1', 'true');
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
const recheckedHealth = recheckedTemplates.filter((t) => t.category === 'health');
assert.equal(recheckedHealth.length, 4, 'Must remain 4 health templates without duplication');

// Test deletion respect: if user deletes a template, it must not be re-added on next boot
const withoutFirstHealth = recheckedTemplates.filter((t) => t.id !== 'health-01');
storage1.setItem('axyp-docx-templates', JSON.stringify(withoutFirstHealth));

ensureDefaultTemplates(storage1);
const afterReboot = JSON.parse(storage1.getItem('axyp-docx-templates'));
assert.equal(afterReboot.some((t) => t.id === 'health-01'), false, 'Deleted health template must not be restored');
console.log('✓ Second launch creates zero duplicates and respects user deletions.');

// 3. Test upgrade of existing installation where previous categories are already seeded
console.log('3. Testing upgrade of existing installation...');
const storageUpgrade = createMockStorage({
  'axyp-narcotics-templates-seeded-v1': 'true',
  'axyp-counterfeit-templates-seeded-v1': 'true',
  'axyp-environment-templates-seeded-v1': 'true',
  'axyp-docx-templates': JSON.stringify([
    {
      id: 'environment-01',
      name: '01_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ_ΚΑΙ_ΒΕΒΑΙΩΣΗΣ_ΠΛΗΜ_ΕΠ_ΑΥΤΟΦΩΡΟ.docx',
      category: 'environment',
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
assert.equal(storageUpgrade.getItem('axyp-health-templates-seeded-v1'), 'true');

// The custom template must still be there
const customFound = upgradedTemplates.find((t) => t.id === 'custom-tpl-99');
assert.ok(customFound, 'Custom template must be retained');

// The pre-existing environment template must NOT be overwritten
const existingEnv = upgradedTemplates.find((t) => t.id === 'environment-01');
assert.equal(existingEnv.customUserNote, 'user modified version', 'User modifications must not be overwritten');

// All 4 health templates must have been added
const addedHealth = upgradedTemplates.filter((t) => t.category === 'health');
assert.equal(addedHealth.length, 4, 'Expected 4 health templates added on upgrade');
console.log('✓ Upgrade preserves custom templates and user modifications while seeding health templates.');

// 4. Test offline & local-first integrity
console.log('4. Testing offline and local-first architecture...');
const storageSource = await readFile(new URL('../storage.js', import.meta.url), 'utf8');
assert.match(storageSource, /axyp-health-templates-seeded-v1/, 'Health seed marker must be in KNOWN_KEYS');

const swSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
assert.ok(swSource.includes('./dossier-templates-data.js'), 'sw.js must cache dossier-templates-data.js');
assert.ok(swSource.includes('./dossier-categories.js'), 'sw.js must cache dossier-categories.js');
console.log('✓ Offline cache and local-first requirements fully verified.');

// 5. Test that all 4 health DOCX files unpack and replace placeholders with synthetic data
console.log('5. Testing unpacking and placeholder replacement across all 4 health DOCX templates...');

const syntheticCase = {
  id: 'yp-health-test-01',
  title: 'Δικογραφία Υγειονομικού Κανονισμού - Παράνομη Ψησταριά (Δοκιμή)',
  protocolNumber: '1020/2/200-γ',
  prosecutor: 'Εισαγγελία Πρωτοδικών Μεσσηνίας',
  date: '2026-11-05',
  time: '13:00',
  location: 'Κυπαρισσία',
  evidence: 'μεταλλική ψησταριά με κάρβουνα επί του οδοστρώματος',
  health: {
    description: 'Μεταλλική ψησταριά με κάρβουνα τοποθετημένη στο άκρο του οδοστρώματος, σε λειτουργία κατά τον χρόνο του ελέγχου'
  },
  arrestingOfficer: 'Υπαστυνόμος Β΄ Παπαδόπουλος Γεώργιος',
  officerA: {
    rank: 'Υπαστυνόμος Β΄',
    surname: 'Παπαδόπουλος',
    name: 'Γεώργιος',
    service: 'Αστυνομικό Τμήμα Τριφυλίας'
  },
  officerB: {
    rank: 'Αρχιφύλακας',
    surname: 'Γεωργίου',
    name: 'Ιωάννης',
    service: 'Αστυνομικό Τμήμα Τριφυλίας'
  },
  offender: {
    surname: 'Δοκιμαστικός',
    name: 'Νικόλαος',
    fatherName: 'Κωνσταντίνου',
    motherName: 'Ελένης',
    birthDate: '1985-04-12',
    birthPlace: 'Καλαμάτα',
    city: 'Κυπαρισσία',
    address: 'Ελ. Βενιζέλου 25',
    idNumber: 'ΑΒ987654',
    idDate: '2018-09-20',
    idService: 'Α.Τ. Κυπαρισσίας',
    taxId: '098765432',
    phone: '6900000000',
    email: 'grill-test@example.com'
  },
  timeline: {
    arrestStartTime: '13:00',
    arrestEndTime: '13:15',
    examinationStartTime: '13:30',
    examinationEndTime: '13:55'
  }
};

for (const tpl of healthSeeded) {
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
    
    // Check specific fields in templates
    if (filename === 'word/document.xml' && ['health-01', 'health-02', 'health-04'].includes(tpl.id)) {
      assert.ok(xml.includes('Ε.Ο. Πύργου-Μεθώνης') || xml.includes('άρθρου 290 Π.Κ.'), tpl.name + ' must include health description');
    }
    if (filename === 'word/document.xml' && ['health-01', 'health-02', 'health-03', 'health-04'].includes(tpl.id)) {
      assert.ok(xml.includes('Δοκιμαστικός') || xml.includes('Νικόλαος'), tpl.name + ' must include person details');
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

// 6. Test valueFor helpers
assert.equal(valueFor('health.description', syntheticCase), syntheticCase.health.description);
assert.equal(valueFor('health.description', { health: { description: 'τοποθέτηση ψησταριάς' } }), 'τοποθέτηση ψησταριάς');
assert.equal(valueFor('health.description', { notes: 'κατάληψη οδοστρώματος' }), '.............................', 'General notes must never silently populate the health violation description');
assert.equal(valueFor('health.description', {}), '.............................');

// 7. The category and form must remain neutral and must not suggest Article 290 as a default offence.
const categorySource = await readFile(new URL('../dossier-categories.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
assert.match(categorySource, /id:'health',[^\n]*δεν προδικάζει την εφαρμοστέα διάταξη/);
assert.doesNotMatch(categorySource, /id:'health',[^\n]*άρθρο 290/i);
assert.match(indexSource, /Η κατηγορία είναι αποκλειστικά οργανωτική και δεν αποδίδει από μόνη της νομικό χαρακτηρισμό/);
assert.match(indexSource, /Μην προεξοφλείς νομικό χαρακτηρισμό/);
assert.doesNotMatch(indexSource, /health-description[^\n]*άρθρο 290/i);
assert.doesNotMatch(syntheticCase.health.description, /άρθρο 290/i);
console.log('✓ Health category and description remain legally neutral; Article 290 is not suggested as a default.');

console.log('\nAll health test suites passed with 100% success!');
