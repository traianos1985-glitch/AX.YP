import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync, zipSync, strFromU8, strToU8 } from '../vendor/fflate.js';
import { DEFAULT_ENVIRONMENT_TEMPLATES } from '../dossier-templates-data.js';
import { ensureDefaultTemplates, initializeDefaultTemplates, getTemplateParts, replaceInXml, valueFor } from '../template-library.js';

console.log('--- Starting Environment Templates & Auto-loader Test Suite ---');

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

assert.equal(storage1.getItem('axyp-environment-templates-seeded-v1'), 'true');
const environmentSeeded = seededTemplates.filter((t) => t.category === 'environment');
assert.equal(environmentSeeded.length, 4, 'Expected exactly 4 seeded environment templates');

const expectedNames = [
  '01_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ_ΚΑΙ_ΒΕΒΑΙΩΣΗΣ_ΠΛΗΜ_ΕΠ_ΑΥΤΟΦΩΡΟ.docx',
  '02_ΕΚΘΕΣΗ_ΕΞΕΤΑΣΗΣ_ΚΑΤΗΓΟΡΟΥΜΕΝΟΥ.docx',
  '03_ΔΕΛΤΙΟ_ΣΤΟΙΧΕΙΩΝ_ΤΑΥΤΟΤΗΤΑΣ_ΚΑΤΗΓΟΡΟΥΜΕΝΟΥ.docx',
  '04_ΔΙΑΒΙΒΑΣΤΙΚΟ_ΕΙΣΑΓΓΕΛΕΙΑ.docx'
];

expectedNames.forEach((expectedName) => {
  const found = environmentSeeded.find((t) => t.name === expectedName);
  assert.ok(found, `Template ${expectedName} must be seeded`);
  assert.ok(found.dataBase64, 'Template must have dataBase64');
  assert.ok(found.mappings, 'Template must have mappings');
  assert.ok(found.mappingConfirmedAt, 'Template mappingConfirmedAt must be pre-confirmed');
  assert.equal(found.category, 'environment');
});
console.log('✓ Clean installation seeded 4 environment templates successfully.');

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
  delayedStorage.setItem('axyp-noise-templates-seeded-v1', 'true');
  delayedStorage.setItem('axyp-camping-templates-seeded-v1', 'true');
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
const recheckedEnvironment = recheckedTemplates.filter((t) => t.category === 'environment');
assert.equal(recheckedEnvironment.length, 4, 'Must remain 4 environment templates without duplication');

// Test deletion respect: if user deletes a template, it must not be re-added on next boot
const withoutFirstEnv = recheckedTemplates.filter((t) => t.id !== 'environment-01');
storage1.setItem('axyp-docx-templates', JSON.stringify(withoutFirstEnv));

ensureDefaultTemplates(storage1);
const afterReboot = JSON.parse(storage1.getItem('axyp-docx-templates'));
assert.equal(afterReboot.some((t) => t.id === 'environment-01'), false, 'Deleted environment template must not be restored');
console.log('✓ Second launch creates zero duplicates and respects user deletions.');

// 3. Test upgrade of existing installation where narcotics & counterfeit are already seeded
console.log('3. Testing upgrade of existing narcotics & counterfeit installation...');
const storageUpgrade = createMockStorage({
  'axyp-narcotics-templates-seeded-v1': 'true',
  'axyp-counterfeit-templates-seeded-v1': 'true',
  'axyp-health-templates-seeded-v1': 'true',
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
assert.equal(storageUpgrade.getItem('axyp-environment-templates-seeded-v1'), 'true');

// The custom template must still be there
const customFound = upgradedTemplates.find((t) => t.id === 'custom-tpl-99');
assert.ok(customFound, 'Custom template must be retained');

// The pre-existing narcotics template must NOT be overwritten
const existingNarcotics = upgradedTemplates.find((t) => t.id === 'narcotics-01');
assert.equal(existingNarcotics.customUserNote, 'user modified version', 'User modifications must not be overwritten');

// All 4 environment templates must have been added
const addedEnvironment = upgradedTemplates.filter((t) => t.category === 'environment');
assert.equal(addedEnvironment.length, 4, 'Expected 4 environment templates added on upgrade');
console.log('✓ Upgrade preserves custom templates and user modifications while seeding environment templates.');

// 4. Test offline & local-first integrity
console.log('4. Testing offline and local-first architecture...');
const storageSource = await readFile(new URL('../storage.js', import.meta.url), 'utf8');
assert.match(storageSource, /axyp-environment-templates-seeded-v1/, 'Environment seed marker must be in KNOWN_KEYS');

const swSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
assert.ok(swSource.includes('./dossier-templates-data.js'), 'sw.js must cache dossier-templates-data.js');
assert.ok(swSource.includes('./dossier-categories.js'), 'sw.js must cache dossier-categories.js');
console.log('✓ Offline cache and local-first requirements fully verified.');

// 5. Test that all 4 environment DOCX files unpack and replace placeholders with synthetic data
console.log('5. Testing unpacking and placeholder replacement across all 4 environment DOCX templates...');

const syntheticCase = {
  id: 'yp-environment-test-01',
  title: 'Δικογραφία Ρύπανσης Περιβάλλοντος (Δοκιμή)',
  protocolNumber: '1020/2/100-β',
  prosecutor: 'Εισαγγελία Πρωτοδικών Μεσσηνίας',
  date: '2026-11-05',
  time: '12:00',
  location: 'Κυπαρισσία',
  evidence: 'παλαιές ηλεκτρικές συσκευές και οικοδομικά απορρίμματα',
  environment: {
    description: 'στον προαύλιο χώρο εγκαταλελειμμένης οικίας, εντός παραπήγματος έξωθεν του οποίου βρίσκονταν εναποτεθειμένες παλαιές συσκευές και απορρίμματα'
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
    birthDate: '1990-01-01',
    birthPlace: 'Καλαμάτα',
    city: 'Κυπαρισσία',
    address: 'Ελ. Βενιζέλου 10',
    idNumber: 'ΑΒ123456',
    idDate: '2015-05-10',
    idService: 'Α.Τ. Καλαμάτας',
    taxId: '012345678',
    phone: '6900000000',
    email: 'test@example.com'
  },
  timeline: {
    arrestStartTime: '12:00',
    arrestEndTime: '12:15',
    examinationStartTime: '12:30',
    examinationEndTime: '12:50'
  }
};

for (const tpl of environmentSeeded) {
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
    if (filename === 'word/document.xml' && ['environment-01', 'environment-04'].includes(tpl.id)) {
      assert.ok(xml.includes('παλαιές συσκευές και απορρίμματα'), tpl.name + ' must include environment description');
    }
    if (filename === 'word/document.xml' && ['environment-01', 'environment-02', 'environment-03', 'environment-04'].includes(tpl.id)) {
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
assert.equal(valueFor('environment.description', syntheticCase), syntheticCase.environment.description);
assert.equal(valueFor('environment.description', { environment: { description: 'ρύπανση ρέματος' } }), 'ρύπανση ρέματος');
assert.equal(valueFor('environment.description', { notes: 'απόρριψη μπαζών', evidence: 'μπάζα' }), '.............................', 'General notes and evidence must never silently populate the environmental act description');
assert.equal(valueFor('environment.description', { environment: { description: '' }, notes: 'γενικές σημειώσεις' }), '.............................');
assert.equal(valueFor('environment.description', {}), '.............................');

// 7. Verify environmental evidence remains separately stored and is not substituted into act descriptions.
const hypothesisSource = await readFile(new URL('../hypotheses.js', import.meta.url), 'utf8');
const bundleSource = await readFile(new URL('../case-bundles.js', import.meta.url), 'utf8');
const htmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
assert.match(htmlSource, /id="environment-documentation"/);
assert.match(hypothesisSource, /documentation:.*environment-documentation/);
assert.match(hypothesisSource, /environment-documentation.*item\.environment && item\.environment\.documentation/);
assert.doesNotMatch(hypothesisSource, /category\.id === 'environment'[\s\S]{0,160}case-offence/);
assert.doesNotMatch(bundleSource, /bundle\.profile === 'environment'[\s\S]{0,180}Παράβαση άρθρου 28/);
assert.match(htmlSource, /δεν αποδίδει από μόνη της νομικό χαρακτηρισμό/);
assert.match(htmlSource, /Δεν εφαρμόζεται αυτομάτως σε κάθε απόρριψη/);
console.log('✓ Environmental description, technical documentation and legal guidance are kept distinct.');

console.log('\nAll environment test suites passed with 100% success!');
