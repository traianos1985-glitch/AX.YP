import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'

const [manifest, serviceWorker, docxExporter, app] = await Promise.all([
  readFile(new URL('../manifest.json', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../docx-export.js', import.meta.url), 'utf8'),
  readFile(new URL('../app.js', import.meta.url), 'utf8')
])

const parsedManifest = JSON.parse(manifest)
assert.equal(parsedManifest.id, './')
assert.equal(parsedManifest.start_url, './')
assert.equal(parsedManifest.scope, './')
assert.ok(parsedManifest.icons.every((icon) => icon.src.startsWith('./')))
assert.match(docxExporter, /word\/styles\.xml/)
assert.match(docxExporter, /styleId="Heading1"/)

const normalizeGreek = (value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ς/g, 'σ')
assert.equal(normalizeGreek('ΚΑΙ'), normalizeGreek('καί'))
assert.match(app, /'κινητο': \['τηλεφωνο'\]/)
assert.match(app, /'τηλεφωνο': \['κινητο'\]/)

let generatedBlob
const context = {
  Blob,
  TextEncoder,
  Uint8Array,
  Uint32Array,
  DataView,
  ArrayBuffer,
  setTimeout,
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
  document: {
    body: { appendChild: () => {} },
    createElement: () => ({ click: () => {}, remove: () => {} })
  },
  window: {}
}
const originalBlob = context.Blob
context.Blob = class extends originalBlob {
  constructor(parts, options) {
    super(parts, options)
    generatedBlob = this
  }
}
vm.runInNewContext(docxExporter, context)
context.window.DocxExport.download({
  title: 'Έλεγχος',
  notice: 'ΠΡΟΣΧΕΔΙΟ',
  rows: [['Πεδίο', 'Τιμή']],
  source: 'https://example.gov.gr/source',
  fileName: 'test.docx'
})
const zipText = new TextDecoder().decode(await generatedBlob.arrayBuffer())
assert.match(zipText, /word\/document\.xml/)
assert.match(zipText, /word\/styles\.xml/)
assert.match(zipText, /Heading1/)

console.log('Smoke tests passed: manifest, offline cache, DOCX archive, and Greek search normalization.')


// Regression checks for shared-computer safety.
const storageSource = await readFile(new URL('../storage.js', import.meta.url), 'utf8')
const templateLibrary = await readFile(new URL('../template-library.js', import.meta.url), 'utf8')
const caseEnhancements = await readFile(new URL('../case-enhancements.js', import.meta.url), 'utf8')
assert.match(storageSource, /key\.indexOf\('axyp-'\) === 0/)
assert.doesNotMatch(storageSource, /localStorage\.clear\(\)/)
assert.doesNotMatch(storageSource, /objectStore\(STORE_NAME\)\.clear\(\)/)
assert.match(templateLibrary, /if \(!activeId\) return null/)
assert.doesNotMatch(templateLibrary, /return all\[0\] \|\| \{\}/)
assert.match(templateLibrary, /if \(!item \|\| !item\.id\)/)
assert.match(caseEnhancements, /if \(!id\) return null/)
assert.doesNotMatch(caseEnhancements, /return list\[0\]/)


// Regression checks for the personal-workspace workflow and privacy contract.
const workspaceSource = await readFile(new URL('../case-folder-storage.js', import.meta.url), 'utf8')
const usageGuide = await readFile(new URL('../ΟΔΗΓΙΕΣ-ΧΡΗΣΗΣ.md', import.meta.url), 'utf8')
const readmeSource = await readFile(new URL('../README.md', import.meta.url), 'utf8')
assert.match(workspaceSource, /personal-workspace/)
assert.match(workspaceSource, /showDirectoryPicker/)
assert.match(workspaceSource, /Δικογραφίες/)
assert.match(workspaceSource, /Ιστορικό/)
assert.doesNotMatch(workspaceSource, /shared-root|Κοινόχρηστος φάκελος/)
// Re-saving a case must never overwrite an officer-edited starter document.
assert.match(workspaceSource, /async function fileExists\(directory, name\)/)
assert.match(workspaceSource, /if \(await fileExists\(documents, name\)\) continue/)
assert.match(workspaceSource, /numberedFileName\(originalName, suffix\+\+\)/)
assert.ok(
  workspaceSource.indexOf("await copyBundleDocuments(saved, directory)") <
  workspaceSource.indexOf("await writeText(directory, 'case.json'")
)

assert.ok(usageGuide.includes('δεν κρυπτογραφούνται από το ίδιο το AX.YP'))
assert.ok(readmeSource.includes('ΟΔΗΓΙΕΣ-ΧΡΗΣΗΣ.md'))
assert.ok(serviceWorker.includes('./case-folder-storage.js'))
assert.ok(serviceWorker.includes('./ΟΔΗΓΙΕΣ-ΧΡΗΣΗΣ.md'))


// Deterministic incident recognition must remain local and must not overstate a legal result.
const incidentSearchSource = await readFile(new URL('../incident-search.js', import.meta.url), 'utf8')
const legalDataSource = await readFile(new URL('../data.js', import.meta.url), 'utf8')
const incidentContext = { window: {} }
vm.runInNewContext(incidentSearchSource, incidentContext)
const incidentSearch = incidentContext.window.AXYPIncidentSearch
assert.equal(incidentSearch.classify('σκύλος με ιδιοκτήτη δάγκωσε άνθρωπο').id, 'dog-bite')
assert.equal(incidentSearch.classify('σκύλος γαβγίζει στον δρόμο').id, 'animal-noise')
const legalContext = { window: {} }
vm.runInNewContext(legalDataSource, legalContext)
const legalModules = legalContext.window.DATA.modules
const animals = legalModules.find((module) => module.id === 'zoa')
const dogBite = animals.items.find((item) => item.id === 'zoa-16')
assert.ok(dogBite)
assert.equal(dogBite.status, 'partial')
assert.match(dogBite.law, /άρθρο 314/)
assert.match(dogBite.notes, /αστική ευθύνη/)
assert.ok(animals.items.some((item) => item.id === 'zoa-12'))
assert.ok(legalModules.some((module) => module.id === 'special-penal'))
assert.ok(legalModules.some((module) => module.id === 'building'))
assert.ok(legalModules.find((module) => module.id === 'building').items.some((item) => item.id === 'building-unauthorized' && item.law.includes('125Θ–125ΙΕ')))
assert.match(legalModules.find((module) => module.id === 'special-penal').items.find((item) => item.id === 'special-migration').law, /5307\/2026/)
assert.ok(legalModules.find((module) => module.id === 'special-penal').items.every((item) => item.status === 'partial'))
assert.ok(incidentSearch.hasCoverage('σκύλος ιδιοκτήτης δάγκωσε άνθρωπο', dogBite))
assert.match(app, /AXYPIncidentSearch\.classify/)
assert.match(app, /Συμπληρωματική διαδικασία — υπό προϋποθέσεις/)


// Article-level law entries must distinguish conduct and avoid obsolete/overbroad legal labels.
const lawContext = { window: {} }
vm.runInNewContext(await readFile(new URL('../data.js', import.meta.url), 'utf8'), lawContext)
const allLegalItems = lawContext.window.DATA.modules.flatMap((module) => module.items)
const findLegal = (id) => allLegalItems.find((item) => item.id === id)
assert.match(findLegal('special-drugs-20').law, /άρθρο 20/)
assert.match(findLegal('special-drugs-29').law, /άρθρο 29/)
assert.match(findLegal('special-drugs-29').procedure, /ποσότητα μόνη της δεν αρκεί/)
assert.match(findLegal('special-weapons-7').law, /άρθρο 7/)
assert.match(findLegal('special-weapons-10').law, /άρθρο 10/)
assert.match(findLegal('special-migration-24').procedure, /διοικητική διαδικασία/)
assert.match(findLegal('special-migration-25').law, /άρθρο 25/)
assert.match(findLegal('building-unauthorized').law, /125Θ–125ΙΕ/)
assert.doesNotMatch(findLegal('building-unauthorized').law, /άρθρο 94 §8/)
assert.ok(['special-drugs-20','special-drugs-29','special-weapons-7','special-weapons-10','special-migration-24','special-migration-25','building-unauthorized'].every((id) => findLegal(id).status === 'partial'))


// Scenario recognition stays deterministic, local, cautious, and scoped to known legal entries.
assert.equal(incidentSearch.classify('βρέθηκε με μικροποσότητα κάνναβης για προσωπική χρήση').id, 'drugs-personal-use');
assert.equal(incidentSearch.classify('πουλούσε και διέθετε ναρκωτικά σε τρίτους').id, 'drugs-trafficking-indicators');
assert.equal(incidentSearch.classify('βρέθηκε με ποσότητα ναρκωτικών'), null);
assert.equal(incidentSearch.classify('βρέθηκε με πιστόλι στην τσέπη στον δρόμο').id, 'weapon-carrying');
assert.equal(incidentSearch.classify('βρέθηκε πιστόλι φυλαγμένο στο σπίτι').id, 'weapon-possession');
assert.equal(incidentSearch.classify('βρέθηκε μαχαίρι'), null);
assert.equal(incidentSearch.classify('οδηγός μετέφερε κρυμμένους αλλοδαπούς προς τα σύνορα').id, 'migration-transport');
assert.equal(incidentSearch.classify('εντοπίστηκε αλλοδαπός με πλαστό διαβατήριο').id, 'migration-documents');
assert.equal(incidentSearch.classify('αλλοδαπός χωρίς άδεια διαμονής').id, 'migration-stay-status');
assert.equal(incidentSearch.classify('ανέγειρε οικοδομή χωρίς οικοδομική άδεια').id, 'building-without-permit');
assert.equal(incidentSearch.classify('διαφωνία για συντελεστή δόμησης'), null);
assert.equal(incidentSearch.classify('βρέθηκε με ποσότητα ναρκωτικών'), null);


// Animal incident scenarios surface only existing legal/procedure entries from the local database.
const animalScenarios = [
  ['σκύλος κακοποιήθηκε και χτυπήθηκε', 'animal-cruelty', ['zoa-1', 'zoa-10', 'zoa-8']],
  ['σκύλος παραμελημένος χωρίς νερό και δεμένος με αλυσίδα', 'animal-neglect', ['zoa-11', 'zoa-6', 'zoa-12']],
  ['ιδιοκτήτης σκύλου τον έχει χωρίς λουρί και χωρίς σήμανση', 'animal-owner-obligations', ['zoa-6', 'zoa-9', 'zoa-12']],
  ['πωλεί κουτάβια μέσω αγγελίας', 'animal-trade', ['zoa-5', 'zoa-27', 'zoa-8', 'zoa-12']],
  ['έκλεψε σκύλο συντροφιάς', 'animal-theft', ['zoa-4']],
  ['σκύλος γαβγίζει και διαταράσσει την κοινή ησυχία', 'animal-noise', ['zoa-15']],
  ['μεταφέρει σκύλο σε όχημα χωρίς κατάλληλες συνθήκες', 'animal-transport', ['zoa-13', 'zoa-26', 'zoa-11']]
];
for (const [description, expectedId, entryIds] of animalScenarios) {
  const match = incidentSearch.classify(description);
  assert.equal(match.id, expectedId, description);
  assert.deepEqual(Array.from(match.primaryEntryIds.concat(match.relatedEntryIds)), entryIds);
  for (const entryId of entryIds) {
    const entry = animals.items.find((item) => item.id === entryId);
    assert.ok(entry, 'Missing linked animal entry: ' + entryId);
    assert.equal(entry.status, 'partial');
    assert.ok(entry.procedure, 'Missing existing procedure field: ' + entryId);
  }
}

const expandedAnimalScenarios = [
  ['σκύλος με κομμένα αυτιά μετά από μη θεραπευτικό ακρωτηριασμό', 'animal-nontherapeutic-mutilation', ['zoa-17', 'zoa-10', 'zoa-9']],
  ['βίντεο στο διαδίκτυο δείχνει βία και κακοποίηση ζώου', 'animal-violent-audiovisual-material', ['zoa-18', 'zoa-10']],
  ['χορήγησε αναβολικά σε άλογο για αγώνα', 'animal-doping-or-excessive-exercise', ['zoa-19', 'zoa-7']],
  ['πανηγύρι με ζώα χωρίς κτηνίατρο και απόφαση δημοτικού συμβουλίου', 'animal-local-traditional-event', ['zoa-20', 'zoa-3', 'zoa-9']],
  ['αφαίρεσε το μικροτσίπ από σκύλο χωρίς εισαγγελική εντολή', 'animal-microchip-removal', ['zoa-21', 'zoa-9', 'zoa-12']],
  ['ο σκύλος δραπέτευσε από την αυλή χωρίς μέτρα περίφραξης', 'animal-escape-prevention', ['zoa-22', 'zoa-6', 'zoa-9']],
  ['βρέθηκε γεράκι άγριας πανίδας σε παράνομη κατοχή', 'wildlife-possession-or-trade', ['zoa-23']],
  ['πωλούσε πουλερικά σε υπαίθρια αγορά χωρίς κτηνιατρικά πιστοποιητικά', 'bird-or-poultry-outdoor-trade', ['zoa-24', 'zoa-13']],
  ['παρεμπόδισε επίσημο έλεγχο προστασίας ζώων και αρνήθηκε στοιχεία', 'animal-inspection-obstruction', ['zoa-25', 'zoa-9']]
];
for (const [description, expectedId, entryIds] of expandedAnimalScenarios) {
  const match = incidentSearch.classify(description);
  assert.equal(match && match.id, expectedId, description);
  assert.deepEqual(Array.from(match.primaryEntryIds.concat(match.relatedEntryIds)), entryIds);
  for (const entryId of entryIds) {
    const entry = animals.items.find((item) => item.id === entryId);
    assert.ok(entry, 'Missing expanded animal entry: ' + entryId);
    assert.equal(entry.status, 'partial');
    assert.ok(entry.procedure, 'Missing procedure/checklist field: ' + entryId);
  }
}
assert.equal(incidentSearch.classify('σκύλος έκανε απλή βόλτα και έφαγε'), null);
assert.equal(incidentSearch.classify('είδα βίντεο με σκύλο να παίζει'), null);
const roadMatch = incidentSearch.classify('οδηγός χτύπησε σκύλο σε τροχαίο και δεν ειδοποίησε τον δήμο');
assert.equal(roadMatch.id, 'animal-road-traffic-injury');
assert.deepEqual(Array.from(roadMatch.primaryEntryIds.concat(roadMatch.relatedEntryIds)), ['zoa-30', 'zoa-13']);
const abandonmentMatch = incidentSearch.classify('εγκατέλειψε σκύλο στον δρόμο');
assert.equal(abandonmentMatch.id, 'animal-abandonment-or-lawful-surrender');
assert.ok(abandonmentMatch.primaryEntryIds.includes('zoa-31'));
assert.equal(incidentSearch.classify('παρέδωσε νόμιμα τον σκύλο στον δήμο'), null);
const exhibitionMatch = incidentSearch.classify('έκθεση σκύλων χωρίς άδεια και χωρίς παρουσία κτηνιάτρου');
assert.equal(exhibitionMatch.id, 'animal-exhibition-requirements');
assert.equal(exhibitionMatch.primaryEntryIds[0], 'zoa-28');
const prizeMatch = incidentSearch.classify('έκανε κλήρωση με κουτάβι ως έπαθλο');
assert.equal(prizeMatch.id, 'animal-public-display-or-prize');
assert.equal(prizeMatch.primaryEntryIds[0], 'zoa-29');
const outdoorDogMatch = incidentSearch.classify('σκύλος μόνιμα δεμένος με αλυσίδα στην αυλή χωρίς κατάλυμα');
assert.equal(outdoorDogMatch.id, 'dog-outdoor-welfare-duties');
assert.equal(outdoorDogMatch.primaryEntryIds[0], 'zoa-32');
assert.equal(incidentSearch.classify('ο σκύλος πήγε βόλτα και έπαιξε'), null);
assert.match(findLegal('zoa-9').penalty, /46\./);
assert.match(findLegal('zoa-9').notes, /70%/);
assert.match(findLegal('zoa-12').procedure, /10 εργάσιμων ημερών/);
assert.doesNotMatch(findLegal('zoa-12').procedure, /5 εργάσιμων ημερών/);
assert.ok(['zoa-17','zoa-18','zoa-19','zoa-20','zoa-21','zoa-22','zoa-23','zoa-24','zoa-25','zoa-26','zoa-27','zoa-28','zoa-29','zoa-30','zoa-31','zoa-32'].every((id) => findLegal(id).status === 'partial'));
assert.match(findLegal('zoa-22').law, /άρθρο 9 §3 περ\. β΄/);
assert.match(findLegal('zoa-8').procedure, /εξαιρετικές καταστάσεις/);
assert.match(findLegal('zoa-11').notes, /δύο ώρες ημερησίως/);
assert.match(findLegal('zoa-31').notes, /νόμιμη παράδοση/);
assert.match(findLegal('zoa-30').penalty, /δεν αποδίδεται το ποσό αυτό αυτομάτως/);
assert.match(findLegal('zoa-27').penalty, /δεν αποδίδεται αυτομάτως σε κάθε παράβαση/);
assert.match(findLegal('zoa-6').notes, /άρθρο 62 ν\. 5143\/2024/);
assert.match(findLegal('zoa-22').notes, /σκύλους εργασίας της Ελληνικής Αστυνομίας/);
assert.match(findLegal('zoa-27').notes, /προγράμματα αναπαραγωγής τους δεν υπόκεινται/);
assert.match(findLegal('zoa-16').notes, /δήμοι δεν ευθύνονται/);
assert.match(findLegal('zoa-32').notes, /όχι γενικά τις περ\. δ΄–στ΄/);
