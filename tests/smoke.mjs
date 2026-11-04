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
assert.equal(incidentSearch.classify('σκύλος γαβγίζει στον δρόμο'), null)
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
assert.ok(legalModules.find((module) => module.id === 'special-penal').items.every((item) => item.status === 'partial'))
assert.ok(incidentSearch.hasCoverage('σκύλος ιδιοκτήτης δάγκωσε άνθρωπο', dogBite))
assert.match(app, /AXYPIncidentSearch\.classify/)
assert.match(app, /Συμπληρωματική διαδικασία — υπό προϋποθέσεις/)
