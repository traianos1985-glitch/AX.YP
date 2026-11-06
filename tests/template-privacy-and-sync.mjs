import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { replaceInXml, getTemplateParts } from '../template-library.js'
import { DEFAULT_NOISE_TEMPLATES } from '../noise-templates-data.js'
import { DEFAULT_CAMPING_TEMPLATES } from '../camping-templates-data.js'
import {
  DEFAULT_NARCOTICS_TEMPLATES,
  DEFAULT_COUNTERFEIT_TEMPLATES,
  DEFAULT_ENVIRONMENT_TEMPLATES,
  DEFAULT_HEALTH_TEMPLATES
} from '../dossier-templates-data.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pairs = [
  ['noise', DEFAULT_NOISE_TEMPLATES, 'templates/noise'],
  ['camping', DEFAULT_CAMPING_TEMPLATES, 'templates/camping'],
  ['narcotics', DEFAULT_NARCOTICS_TEMPLATES, 'templates/dossiers/narcotics'],
  ['environment', DEFAULT_ENVIRONMENT_TEMPLATES, 'templates/dossiers/environment'],
  ['health', DEFAULT_HEALTH_TEMPLATES, 'templates/dossiers/health']
]

for (const [category, templates, directory] of pairs) {
  const files = (await readdir(path.join(root, directory))).filter((name) => name.endsWith('.docx')).sort()
  const sortedTemplates = [...templates].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  assert.equal(sortedTemplates.length, files.length, `${category}: embedded and source template counts match`)
  for (let i = 0; i < files.length; i += 1) {
    const embedded = Buffer.from(sortedTemplates[i].dataBase64, 'base64')
    const source = await readFile(path.join(root, directory, files[i]))
    assert.deepEqual(embedded, source, `${category}/${sortedTemplates[i].id}: embedded DOCX matches source file byte-for-byte`)
    assert.equal(embedded.readUInt32LE(0), 0x04034b50, `${category}/${sortedTemplates[i].id}: DOCX has ZIP local-file signature`)
    assert.ok(embedded.includes(Buffer.from('word/document.xml')), `${category}/${sortedTemplates[i].id}: DOCX contains the main Word document part`)
  }
}

for (const template of DEFAULT_COUNTERFEIT_TEMPLATES) {
  const embedded = Buffer.from(template.dataBase64, 'base64')
  assert.equal(embedded.readUInt32LE(0), 0x04034b50, `${template.id}: DOCX has ZIP local-file signature`)
  assert.ok(embedded.includes(Buffer.from('word/document.xml')), `${template.id}: DOCX contains the main Word document part`)
}

const narcoticsSubmission = DEFAULT_NARCOTICS_TEMPLATES.find((template) => template.id === 'narcotics-08')
assert.ok(narcoticsSubmission)
for (const field of ['case.location', 'case.notes', 'incident.time', 'officerA.service', 'timeline.release.startTime', 'case.prosecutor']) {
  assert.ok(narcoticsSubmission.fields.includes(field), `narcotics-08 declares ${field}`)
  assert.equal(narcoticsSubmission.mappings[field], field)
}

const noiseArrest = DEFAULT_NOISE_TEMPLATES.find((template) => template.id === 'noise-01')
assert.ok(noiseArrest)
const noiseParts = getTemplateParts(noiseArrest)
const noiseXml = new TextDecoder().decode(noiseParts['word/document.xml'])
assert.ok(!noiseXml.includes('{{owner.'), 'legacy owner personal data is not left as unresolved placeholders')
assert.ok(noiseXml.includes('τα πλήρη στοιχεία θα συμπληρωθούν από τον συντάκτη'), 'owner details are left as a deliberate manual completion field')

const greekPlaceholderXml = '<w:p><w:r><w:t>{{ΑΡΜΟΔΙΟΣ_ΕΙΣΑΓΓΕΛΕΑΣ}}</w:t></w:r></w:p>'
const rendered = replaceInXml(greekPlaceholderXml, { mappings: { 'ΑΡΜΟΔΙΟΣ_ΕΙΣΑΓΓΕΛΕΑΣ': 'case.prosecutor' } }, { prosecutor: 'Εισαγγελία Πρωτοδικών' })
assert.ok(rendered.includes('Εισαγγελία Πρωτοδικών'), 'Greek placeholder identifiers are recognized and mapped')
assert.ok(!rendered.includes('{{ΑΡΜΟΔΙΟΣ_ΕΙΣΑΓΓΕΛΕΑΣ}}'), 'Greek placeholder is not left unresolved')

console.log('Template privacy/synchronization regressions passed.')
