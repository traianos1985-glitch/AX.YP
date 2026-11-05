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
assert.equal(incidentSearch.classify('δύο άτομα χτύπησαν και τραυμάτισαν έναν πολίτη').id, 'penal-bodily-injury');
assert.equal(incidentSearch.classify('αστυνομικός δέχθηκε χτύπημα κατά την εκτέλεση ελέγχου').id, 'penal-violence-against-official');
assert.equal(incidentSearch.classify('τον απείλησε ότι θα τον χτυπήσει').id, 'penal-threat-or-unlawful-coercion');
assert.equal(incidentSearch.classify('τον εξανάγκασε με απειλή να του δώσει τα χρήματα').id, 'penal-threat-or-unlawful-coercion');
assert.equal(incidentSearch.classify('έκλεψε το κινητό τηλέφωνο από το τραπέζι').id, 'penal-theft-or-property-damage');
assert.equal(incidentSearch.classify('έσπασε το τζάμι του αυτοκινήτου του γείτονα').id, 'penal-theft-or-property-damage');
assert.equal(incidentSearch.classify('εξαπάτησε τον πολίτη και του απέσπασε χρήματα με τραπεζική μεταφορά').id, 'penal-fraud');
assert.equal(incidentSearch.classify('κατήγγειλε εν γνώσει του ψευδώς ότι ο γείτονας έκλεψε').id, 'penal-false-accusation-or-report');
for (const id of ['pk-5','pk-6','pk-7','pk-8','pk-9','pk-10']) {
  const entry = allLegalItems.find((item) => item.id === id);
  assert.ok(entry, 'Missing Penal Code entry: ' + id);
  assert.equal(entry.status, 'partial');
}
assert.equal(incidentSearch.classify('δύο φίλοι διαφώνησαν έντονα'), null);
assert.equal(incidentSearch.classify('δεν βρέθηκαν χρήματα στο πορτοφόλι'), null);
assert.equal(incidentSearch.classify('έκανε καταγγελία αλλά δεν αποδείχθηκε'), null);
assert.equal(incidentSearch.classify('οδηγός έκανε λάθος στην πληρωμή'), null);

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
assert.match(findLegal('zoa-9').notes, /70 € ανά ζώο και 40 € για κυνηγετικό σκύλο/);
assert.match(findLegal('zoa-16').notes, /για αδέσποτο χωρίς σήμανση ευθύνεται ο δήμος/);
assert.equal(findLegal('zoa-33').status, 'partial');
assert.equal(findLegal('zoa-34').status, 'partial');
assert.match(findLegal('zoa-34').procedure, /συγκεκριμένα στοιχεία/);
assert.match(findLegal('zoa-34').procedure, /Taxisnet/);
assert.match(findLegal('zoa-34').procedure, /άρθρο 36 §5 ν\. 5270\/2026/);
assert.match(findLegal('zoa-34').procedure, /διαπιστωτική πράξη/);
assert.doesNotMatch(findLegal('zoa-34').procedure, /ψηφιακή εφαρμογή και ιστοσελίδα/);
assert.match(findLegal('zoa-29').procedure, /επόμενη εργάσιμη ημέρα/);
assert.match(findLegal('zoa-29').procedure, /συνδρομή της αστυνομίας/);
assert.doesNotMatch(findLegal('zoa-6').notes, /έκθεση σκύλων\/γατών σε pet shops/);
assert.match(findLegal('zoa-33').notes, /ειδικό μητρώο/);
assert.match(findLegal('zoa-33').notes, /δεν αφορούν ιδιωτικό ζώο αστυνομικού/);
assert.equal(incidentSearch.classify('σκύλος εργασίας της Ελληνικής Αστυνομίας κατά την εκτέλεση υπηρεσίας').id, 'animal-police-working-dog');
assert.equal(incidentSearch.classify('αστυνομικός βρήκε σκύλο στον δρόμο'), null);
assert.equal(incidentSearch.classify('ανώνυμη καταγγελία για κακοποίηση ζώου με συγκεκριμένα στοιχεία').id, 'animal-report-or-anonymous-complaint');


// KPD procedural entries are current-source linked, cautious, and remain partial.
const kpdModule = legalModules.find((module) => module.id === 'kpd');
assert.ok(kpdModule);
const findKpd = (id) => kpdModule.items.find((item) => item.id === id);
for (const id of ['kpd-0','kpd-1','kpd-2','kpd-3','kpd-4','kpd-5','kpd-6','kpd-7','kpd-8','kpd-9','kpd-10']) {
  assert.ok(findKpd(id), 'Missing KPD entry: ' + id);
  assert.equal(findKpd(id).status, 'partial');
  assert.match(findKpd(id).source, /taxheaven\.gr\/law\/4620\/2019/);
}
assert.match(findKpd('kpd-4').procedure, /έξι μήνες/);
assert.match(findKpd('kpd-5').procedure, /χωρίς όρκο/);
assert.match(findKpd('kpd-6').procedure, /γραπτή παραγγελία/);
assert.match(findKpd('kpd-6').procedure, /χωρίς προηγούμενη εισαγγελική παραγγελία/);
assert.match(findKpd('kpd-7').procedure, /αναλογικότητας/);
assert.match(findKpd('kpd-2').procedure, /κατ’ έγκληση/);
assert.match(findKpd('kpd-3').procedure, /24 ωρών/);
assert.match(findKpd('kpd-3').procedure, /12 ωρών/);
assert.match(findKpd('kpd-8').procedure, /ύποπτος φυγής/);
assert.match(findKpd('kpd-9').procedure, /σχετική έκθεση/);
assert.match(findKpd('kpd-10').procedure, /ή να απολυθεί/);
assert.equal(incidentSearch.classify('προκαταρκτική εξέταση για συλλογή αποδεικτικών στοιχείων').id, 'kpd-preliminary-examination');
assert.equal(incidentSearch.classify('δικαιώματα υπόπτου κατά την προκαταρκτική εξέταση').id, 'kpd-preliminary-examination');
assert.equal(incidentSearch.classify('διενέργεια προανάκρισης με γραπτή εισαγγελική παραγγελία').id, 'kpd-preliminary-inquiry');
assert.equal(incidentSearch.classify('αυτεπάγγελτη προανάκριση λόγω κινδύνου απώλειας αποδεικτικών στοιχείων').id, 'kpd-preliminary-inquiry');
assert.equal(incidentSearch.classify('καθήκοντα ανακριτικού υπαλλήλου και αρχή αναλογικότητας').id, 'kpd-investigator-duties');
assert.equal(incidentSearch.classify('σύλληψη για αυτόφωρο πλημμέλημα και προσαγωγή στον εισαγγελέα').id, 'kpd-arrest-and-detention');
assert.equal(incidentSearch.classify('εκτέλεση εντάλματος σύλληψης').id, 'kpd-arrest-and-detention');
assert.equal(incidentSearch.classify('πώς γίνεται η σύλληψη και η κατάσχεση πειστηρίων').id, 'kpd-arrest-and-detention');
assert.equal(incidentSearch.classify('είχε μια συζήτηση με τον γείτονα'), null);


// KPD reporting, complaint and prosecution lifecycle.
for (const id of ['kpd-11','kpd-12','kpd-13','kpd-14','kpd-15']) {
  const entry = findKpd(id);
  assert.ok(entry, 'Missing KPD entry: ' + id);
  assert.equal(entry.status, 'partial');
  assert.match(entry.source, /taxheaven\.gr\/law\//);
}
assert.match(findKpd('kpd-11').procedure, /χωρίς χρονοτριβή/);
assert.match(findKpd('kpd-11').notes, /δεν θεσπίζει γενική υποχρέωση/);
assert.match(findKpd('kpd-12').procedure, /συντάσσεται έκθεση/);
assert.match(findKpd('kpd-12').notes, /δεν ταυτίζεται με την έγκληση/);
assert.match(findKpd('kpd-13').procedure, /νέων πραγματικών περιστατικών ή στοιχείων/);
assert.match(findKpd('kpd-13').notes, /δεν ισοδυναμεί με δικαστική αθώωση/);
assert.match(findKpd('kpd-14').procedure, /τρεις μήνες/);
assert.match(findKpd('kpd-14').notes, /άρθρο 114 ΠΚ/);
assert.match(findKpd('kpd-15').procedure, /15 ημέρες/);
assert.match(findKpd('kpd-15').procedure, /350 €/);
assert.match(findKpd('kpd-15').notes, /καταργημένο/);
assert.equal(incidentSearch.classify('ανακοίνωση αξιόποινης πράξης από ανακριτικό υπάλληλο').id, 'kpd-reporting-duty');
assert.equal(incidentSearch.classify('υποχρέωση δημόσιου υπαλλήλου να ανακοινώσει αξιόποινη πράξη').id, 'kpd-reporting-duty');
assert.equal(incidentSearch.classify('υποβολή μήνυσης προφορικά σε ανακριτικό υπάλληλο').id, 'kpd-criminal-complaint-submission');
assert.equal(incidentSearch.classify('κατέθεσε μήνυση για κλοπή').id, 'kpd-criminal-complaint-submission');
assert.equal(incidentSearch.classify('εισαγγελέας αρχειοθέτησε τη μήνυση').id, 'kpd-complaint-deadlines-fees-and-withdrawal');
assert.equal(incidentSearch.classify('άσκηση ποινικής δίωξης μετά από προκαταρκτική εξέταση').id, 'kpd-prosecution-and-archiving');
assert.equal(incidentSearch.classify('προσφυγή κατά απόρριψης έγκλησης μέσα σε δεκαπέντε ημέρες').id, 'kpd-complaint-deadlines-fees-and-withdrawal');
assert.equal(incidentSearch.classify('ανάκληση ήδη υποβληθείσας έγκλησης').id, 'kpd-complaint-deadlines-fees-and-withdrawal');
assert.equal(incidentSearch.classify('παραίτηση από το δικαίωμα έγκλησης').id, 'kpd-complaint-deadlines-fees-and-withdrawal');
assert.equal(incidentSearch.classify('η έγκληση υποβάλλεται εντός τριών μηνών').id, 'kpd-complaint-deadlines-fees-and-withdrawal');
assert.equal(incidentSearch.classify('κατήγγειλε εν γνώσει του ψευδώς ότι ο γείτονας έκλεψε').id, 'penal-false-accusation-or-report');
assert.equal(incidentSearch.classify('είχε μια συζήτηση με τον γείτονα'), null);


// KPD authority request, prosecution permission and res judicata safeguards.
for (const id of ['kpd-16','kpd-17','kpd-18','kpd-19']) {
  const entry = findKpd(id);
  assert.ok(entry, 'Missing KPD entry: ' + id);
  assert.equal(entry.status, 'partial');
  assert.match(entry.source, /taxheaven\.gr\/law\/4620\/2019\/arthro\//);
}
assert.match(findKpd('kpd-16').procedure, /εκπρόσωπο της εισαγγελικής αρχής/);
assert.match(findKpd('kpd-16').notes, /ΑΠ 10\/2022/);
assert.match(findKpd('kpd-16').notes, /όχι σε ανακριτικό υπάλληλο/);
assert.match(findKpd('kpd-17').procedure, /Δεν επιτρέπονται.*ανακριτικές πράξεις/s);
assert.match(findKpd('kpd-17').procedure, /συγκατηγορούμενοι/);
assert.match(findKpd('kpd-17').notes, /δεν δημιουργεί από μόνο του καθεστώς ασυλίας/);
assert.match(findKpd('kpd-18').procedure, /ίδια πράξη/);
assert.match(findKpd('kpd-18').procedure, /μεταγενέστερες κηρύσσονται απαράδεκτες/);
assert.match(findKpd('kpd-19').procedure, /δοθεί κανονικά αργότερα/);
assert.match(findKpd('kpd-19').notes, /δεν αποτελεί γενική δυνατότητα επανάληψης/);
assert.equal(incidentSearch.classify('αίτηση της αρχής για άσκηση ποινικής δίωξης').id, 'kpd-authority-application-for-prosecution');
assert.equal(incidentSearch.classify('προφορική αίτηση αρχής προς τον εισαγγελέα για δίωξη').id, 'kpd-authority-application-for-prosecution');
assert.equal(incidentSearch.classify('άδεια για δίωξη και περιορισμοί ανακριτικών πράξεων πριν από τη χορήγησή της').id, 'kpd-permission-before-prosecution');
assert.equal(incidentSearch.classify('άρνηση χορήγησης άδειας δίωξης').id, 'kpd-permission-before-prosecution');
assert.equal(incidentSearch.classify('δεδικασμένο για την ίδια πράξη μετά από αμετάκλητη αθώωση').id, 'kpd-res-judicata-or-pending-prosecution');
assert.equal(incidentSearch.classify('εκκρεμοδικία για το ίδιο πρόσωπο και την ίδια πράξη').id, 'kpd-res-judicata-or-pending-prosecution');
assert.equal(incidentSearch.classify('νέα άσκηση ποινικής δίωξης μετά από έλλειψη έγκλησης').id, 'kpd-new-prosecution-after-procedural-defect');
assert.equal(incidentSearch.classify('νέα δίωξη μετά από παρατυπία της αίτησης ή της άδειας').id, 'kpd-new-prosecution-after-procedural-defect');
assert.equal(incidentSearch.classify('έχει υποβληθεί απλή μήνυση για κλοπή').id, 'kpd-criminal-complaint-submission');
assert.equal(incidentSearch.classify('είχε μια συζήτηση με τον γείτονα'), null);


// KPD search, personal-search, search-report and digital-evidence safeguards.
for (const id of ['kpd-20','kpd-21','kpd-22','kpd-23','kpd-24']) {
  const entry = findKpd(id);
  assert.ok(entry, 'Missing KPD entry: ' + id);
  assert.equal(entry.status, 'partial');
  assert.match(entry.source, /taxheaven\.gr\/law\/4620\/2019\/arthro\//);
}
assert.match(findKpd('kpd-20').procedure, /σφραγίδων/);
assert.match(findKpd('kpd-20').procedure, /να μην απομακρυνθεί κανείς/);
assert.match(findKpd('kpd-21').procedure, /μόνο με αυτήν/);
assert.match(findKpd('kpd-21').procedure, /παρουσία εκπροσώπων της δικαστικής εξουσίας/);
assert.match(findKpd('kpd-21').notes, /προανακριτής πρωτοδίκης και πρωτοδίκης/);
assert.match(findKpd('kpd-21').notes, /20:00–06:00/);
assert.match(findKpd('kpd-22').procedure, /σοβαρή και βάσιμη υπόνοια/);
assert.match(findKpd('kpd-22').procedure, /χωριστά για κάθε πρόσωπο/);
assert.match(findKpd('kpd-23').procedure, /συντάσσεται έκθεση/);
assert.match(findKpd('kpd-23').procedure, /απλώς παραδόθηκαν/);
assert.match(findKpd('kpd-24').procedure, /ειδική έκθεση/);
assert.match(findKpd('kpd-24').notes, /cloud/);
assert.match(findKpd('kpd-24').notes, /δεν θεωρούνται.*διασυνδεδεμένο/);
assert.match(findKpd('kpd-24').notes, /άρθρο 85 ν\. 5090\/2024/);
assert.match(findKpd('kpd-24').notes, /σφραγίζεται/);
assert.equal(incidentSearch.classify('διασφάλιση τόπου εγκλήματος με σφραγίδες και φύλακες').id, 'kpd-scene-and-evidence-preservation');
assert.equal(incidentSearch.classify('έρευνα κατοικίας κατά τη διάρκεια της ημέρας').id, 'kpd-search-and-home-search-formalities');
assert.equal(incidentSearch.classify('νυχτερινή έρευνα σε οικία για σύλληψη').id, 'kpd-search-and-home-search-formalities');
assert.equal(incidentSearch.classify('σωματική έρευνα τρίτου προσώπου και προϋποθέσεις').id, 'kpd-personal-search');
assert.equal(incidentSearch.classify('κατάσχεση ψηφιακών δεδομένων από κινητό τηλέφωνο και αντιγραφή').id, 'kpd-digital-evidence-seizure');
assert.equal(incidentSearch.classify('κατάσχεση δεδομένων υπολογιστή και έλεγχος ακεραιότητας').id, 'kpd-digital-evidence-seizure');
assert.equal(incidentSearch.classify('έκθεση έρευνας και μεσεγγύηση ευρημάτων').id, 'kpd-search-report-and-sequestration');
assert.equal(incidentSearch.classify('έρευνα σε τρίτο πρόσωπο για αντικείμενο και σωματικός έλεγχος').id, 'kpd-personal-search');
assert.equal(incidentSearch.classify('είχε μια συζήτηση με τον γείτονα'), null);


// Final KPD coverage package: seizure lifecycle, reports, evidence, measures and remedies.
for (const id of ['kpd-25','kpd-26','kpd-27','kpd-28','kpd-29','kpd-30','kpd-31','kpd-32']) {
  const entry = findKpd(id);
  assert.ok(entry, 'Missing final KPD entry: ' + id);
  assert.equal(entry.status, 'partial');
  assert.match(entry.source, /taxheaven\.gr\/law\/4620\/2019/);
}
assert.match(findKpd('kpd-25').procedure, /δέκα ημέρες/);
assert.match(findKpd('kpd-25').notes, /δεν αποτελεί γενική εντολή καταστροφής/);
assert.match(findKpd('kpd-26').procedure, /μόνο εφόσον αυτά δεν επαρκούν/);
assert.match(findKpd('kpd-26').notes, /έσχατο μέτρο/);
assert.match(findKpd('kpd-27').procedure, /ακριβή περιγραφή/);
assert.match(findKpd('kpd-27').procedure, /υπογραφές/);
assert.match(findKpd('kpd-28').procedure, /κάθε αμφιβολία/);
assert.match(findKpd('kpd-28').notes, /αξιόποινες πράξεις/);
assert.match(findKpd('kpd-29').notes, /δεν είναι αυτοματοποιημένη/);
assert.match(findKpd('kpd-30').notes, /δεν διαγιγνώσκει ψυχική κατάσταση/);
assert.match(findKpd('kpd-31').notes, /209–233/);
assert.match(findKpd('kpd-32').notes, /δεν επιχειρεί να συμπυκνώσει όλες τις προθεσμίες/);
assert.match(findKpd('kpd-31').source, /arthro\/209$/);
assert.match(findKpd('kpd-32').law, /476Α/);
assert.match(findKpd('kpd-32').notes, /άρθρο 63 ν\. 5282\/2026/);
assert.equal(incidentSearch.classify('φύλαξη και σφράγιση κατασχεμένων πειστηρίων').id, 'kpd-seized-property-chain-of-custody');
assert.equal(incidentSearch.classify('αίτηση άρσης κατάσχεσης πειστηρίων').id, 'kpd-seized-property-chain-of-custody');
assert.equal(incidentSearch.classify('προσωρινή κράτηση και περιοριστικοί όροι μετά την απολογία').id, 'kpd-restrictive-terms-and-pretrial-detention');
assert.equal(incidentSearch.classify('έκθεση χωρίς υπογραφή και χρονολογία').id, 'kpd-formal-validity-of-procedural-reports');
assert.equal(incidentSearch.classify('παράνομα αποδεικτικά στοιχεία και αμφιβολίες').id, 'kpd-evidence-and-exclusionary-rule');
assert.equal(incidentSearch.classify('προδικαστικό ζήτημα με εκκρεμή αστική διαφορά').id, 'kpd-preliminary-issues-and-parallel-proceedings');
assert.equal(incidentSearch.classify('ψυχιατρική πραγματογνωμοσύνη κατηγορουμένου').id, 'kpd-psychiatric-expertise-and-special-knowledge');
assert.equal(incidentSearch.classify('εξέταση μάρτυρα με ειδικές γνώσεις').id, 'kpd-witness-examination');
assert.equal(incidentSearch.classify('προθεσμία έφεσης και αναίρεσης').id, 'kpd-appeals-and-enforcement-index');
assert.equal(incidentSearch.classify('έφτιαξε καφέ και πήγε σπίτι'), null);

const dataSource = await readFile(new URL('../data.js', import.meta.url), 'utf8')
const dataContext = { window: {} }
vm.runInNewContext(dataSource, dataContext)
const domesticViolence = dataContext.window.DATA.modules.find((module) => module.id === 'evb')
assert.ok(domesticViolence, 'domestic violence module exists')
const responseGuide = domesticViolence.items.find((item) => item.id === 'evb-5')
assert.ok(responseGuide, 'domestic violence response guide exists')
assert.match(responseGuide.procedure, /εποχούμενης περιπολίας/)
assert.match(responseGuide.procedure, /γραπτό μήνυμα στο 100/)
assert.match(responseGuide.procedure, /προανακριτικού υλικού/)
assert.match(responseGuide.procedure, /δομές φιλοξενίας/)
assert.match(responseGuide.procedure, /εισαγγελικών αρχών/)
assert.match(responseGuide.notes, /δεν αποτελεί πλήρες επιχειρησιακό πρωτόκολλο/)
assert.equal(responseGuide.status, 'partial')
assert.equal(responseGuide.source, 'https://www.astynomia.gr/')


// Timeline sequence and interval calculation tests
const { computeTimeline, addMinutes } = await import('../template-library.js')
assert.equal(addMinutes('05:00', 5), '05:05')
assert.equal(addMinutes('05:05', 1), '05:06')
assert.equal(addMinutes('23:58', 5), '00:03')

const timeline = computeTimeline('05:00')
assert.equal(timeline.witnessStartTime, '05:00')
assert.equal(timeline.witnessEndTime, '05:05')
assert.equal(timeline.arrestStartTime, '05:06')
assert.equal(timeline.arrestEndTime, '05:11')
assert.equal(timeline.seizureStartTime, '05:12')
assert.equal(timeline.seizureEndTime, '05:17')
assert.equal(timeline.notificationStartTime, '05:18')
assert.equal(timeline.notificationEndTime, '05:23')
assert.equal(timeline.weighingStartTime, '05:24')
assert.equal(timeline.weighingEndTime, '05:29')
assert.equal(timeline.examinationStartTime, '05:30')
assert.equal(timeline.examinationEndTime, '05:35')

console.log('Dossier timeline calculation smoke tests passed.')


// Import and execute narcotics templates test suite
await import('./narcotics-templates.mjs');
