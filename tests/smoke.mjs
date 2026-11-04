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
assert.match(serviceWorker, /CACHE_NAME = "axyp-v6"/)
assert.match(serviceWorker, /\.\/sources\/poinikos-kodikas\.md/)
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
assert.match(caseEnhancements, /if \(!id\) return null/)
assert.doesNotMatch(caseEnhancements, /return list\[0\]/)
