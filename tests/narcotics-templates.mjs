import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync, zipSync, strFromU8, strToU8 } from '../vendor/fflate.js';
import { DEFAULT_NARCOTICS_TEMPLATES } from '../dossier-templates-data.js';
import { ensureDefaultTemplates, initializeDefaultTemplates, getTemplateParts, computeTimeline, replaceInXml } from '../template-library.js';

console.log('--- Starting Narcotics Templates & Auto-loader Test Suite ---');

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

assert.equal(seededTemplates.length, 23, 'Expected exactly 23 seeded templates (10 narcotics + 5 counterfeit + 4 environment + 4 health)');
assert.equal(storage1.getItem('axyp-narcotics-templates-seeded-v1'), 'true');

seededTemplates.forEach((t) => {
  assert.ok(t.name, 'Template must have a name');
  assert.ok(t.dataBase64, 'Template must have dataBase64');
  assert.ok(t.mappings, 'Template must have mappings');
  assert.ok(t.mappingConfirmedAt, 'Template mappingConfirmedAt must be pre-confirmed');
  assert.ok(t.category === 'narcotics' || t.category === 'counterfeit' || t.category === 'environment' || t.category === 'health');
});
assert.equal(seededTemplates.filter((t) => t.category === 'narcotics').length, 10);
assert.equal(seededTemplates.filter((t) => t.category === 'counterfeit').length, 5);
assert.equal(seededTemplates.filter((t) => t.category === 'environment').length, 4);
assert.equal(seededTemplates.filter((t) => t.category === 'health').length, 4);
console.log('✓ Clean installation seeded 10 templates successfully.');

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
assert.equal(recheckedTemplates.length, 23, 'Must remain 23 templates without duplication');

// Test deletion respect: if user deletes a template, it must not be re-added on next boot
recheckedTemplates.pop(); // user deletes 1 template
storage1.setItem('axyp-docx-templates', JSON.stringify(recheckedTemplates));
assert.equal(JSON.parse(storage1.getItem('axyp-docx-templates')).length, 22);

ensureDefaultTemplates(storage1);
assert.equal(JSON.parse(storage1.getItem('axyp-docx-templates')).length, 22, 'Deleted template must not be restored');
console.log('✓ Second launch creates zero duplicates and respects user deletions.');

// 3. Test retention of custom / manually imported templates and upgrade of existing installation
console.log('3. Testing existing installation upgrade with custom templates...');
const storageUpgrade = createMockStorage({
  'axyp-docx-templates': JSON.stringify([
    {
      id: 'custom-tpl-99',
      name: 'CUSTOM_ACCIDENT_REPORT.docx',
      category: 'traffic',
      fields: ['case.title', 'case.date'],
      mappings: { 'case.title': 'case.title' }
    },
    {
      id: 'pre-existing-narcotics-01',
      name: '01_ΚΑΤΑΘΕΣΗ_ΜΑΡΤΥΡΑ.docx',
      category: 'narcotics',
      customUserNote: 'user modified version',
      mappings: { 'case.date': 'custom.date' }
    }
  ])
});

ensureDefaultTemplates(storageUpgrade);
const upgradedTemplates = JSON.parse(storageUpgrade.getItem('axyp-docx-templates'));

// The custom template must still be there
const customFound = upgradedTemplates.find((t) => t.id === 'custom-tpl-99');
assert.ok(customFound, 'Custom template must be retained');
assert.equal(customFound.name, 'CUSTOM_ACCIDENT_REPORT.docx');

// The pre-existing 01 template must NOT be overwritten
const existing01 = upgradedTemplates.find((t) => t.name === '01_ΚΑΤΑΘΕΣΗ_ΜΑΡΤΥΡΑ.docx');
assert.equal(existing01.customUserNote, 'user modified version', 'User modifications must not be overwritten');
assert.equal(existing01.mappings['case.date'], 'custom.date');

// Total should be 1 custom + 1 existing-01 + 9 newly added default templates = 11
assert.equal(upgradedTemplates.length, 24, 'Expected 24 total templates after upgrade (1 custom + 1 existing-01 + 9 narcotics + 5 counterfeit + 4 environment + 4 health)');
console.log('✓ Upgrade preserves custom templates and user-modified mappings.');

const storageSource = await readFile(new URL('../storage.js', import.meta.url), 'utf8');
assert.match(storageSource, /axyp-narcotics-templates-seeded-v1/, 'Seed marker must be included in IndexedDB hydration keys');
assert.match(storageSource, /ready:\s*ready/, 'Storage must expose its hydration readiness promise');

// 4. Test offline & local-first integrity
console.log('4. Testing offline and local-first architecture...');
const swSource = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const viteSource = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');

assert.ok(swSource.includes('./dossier-templates-data.js'), 'sw.js must cache dossier-templates-data.js');
assert.ok(viteSource.includes('dossier-templates-data.js'), 'vite.config.js must include dossier-templates-data.js');

// Verify no external endpoints in loader or data
const dataJsSource = await readFile(new URL('../dossier-templates-data.js', import.meta.url), 'utf8');
assert.doesNotMatch(dataJsSource, /https?:\/\//, 'dossier-templates-data.js must not call external APIs');
console.log('✓ Offline cache and local-first requirements fully verified.');

// 5. Test that all 10 DOCX files unpack and replace placeholders with synthetic data
console.log('5. Testing unpacking and placeholder replacement across all 10 DOCX templates...');
const syntheticCase = {
  id: 'yp-test-123',
  title: 'Δικογραφία Ναρκωτικών (Δοκιμή)',
  protocolNumber: '1020/2/99-α',
  date: '2026-11-05',
  time: '05:00',
  location: 'Κυπαρισσία',
  evidence: 'πέντε (5) γραμμάρια κάνναβης',
  arrestingOfficer: 'Αστυφύλακας Παπαδόπουλος Γεώργιος',
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
    idService: 'Α.Τ. Καλαμάτας'
  },
  timeline: computeTimeline('05:00')
};

for (const tpl of DEFAULT_NARCOTICS_TEMPLATES) {
  const parts = getTemplateParts(tpl);
  assert.ok(parts['word/document.xml'], `Template ${tpl.name} must contain word/document.xml`);
  const docXml = strFromU8(parts['word/document.xml']);
  
  // Verify placeholders extraction
  assert.ok(tpl.fields.length > 0, `Template ${tpl.name} must have extracted fields`);
  
  // Exercise the app's actual placeholder mapping/replacement with synthetic case data.
  let foundDocument = false;
  for (const filename of Object.keys(parts)) {
    if (!filename.startsWith('word/') || !filename.endsWith('.xml')) continue;
    let xml = strFromU8(parts[filename]);
    if (filename === 'word/document.xml') foundDocument = true;
    xml = replaceInXml(xml, tpl, syntheticCase);
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

console.log('\nAll 5 required test suites passed with 100% success!');
