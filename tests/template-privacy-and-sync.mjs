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

const noiseArrest = DEFAULT_NOISE_TEMPLATES.find((template) => template.id === 'noise-01')
assert.ok(noiseArrest)
const ownerFields = ['owner.fullName', 'owner.fatherName', 'owner.motherName', 'owner.birthDate', 'owner.birthPlace', 'owner.city', 'owner.idNumber', 'owner.idDate', 'owner.idService', 'owner.taxId', 'owner.taxOffice']
for (const field of ownerFields) {
  assert.ok(noiseArrest.fields.includes(field), `noise-01 declares ${field}`)
  assert.equal(noiseArrest.mappings[field], field)
}
const noiseParts = getTemplateParts(noiseArrest)
const noiseXml = new TextDecoder().decode(noiseParts['word/document.xml'])
const noiseRendered = replaceInXml(noiseXml, noiseArrest, {
  owner: {
    fullName: 'SYNTHETIC OWNER',
    fatherName: 'SYNTHETIC FATHER',
    motherName: 'SYNTHETIC MOTHER',
    birthDate: '1980-01-02',
    birthPlace: 'SYNTHETIC BIRTH PLACE',
    city: 'SYNTHETIC CITY',
    idNumber: 'TEST-ID',
    idDate: '2020-01-02',
    idService: 'TEST ISSUING AUTHORITY',
    taxId: '000000000',
    taxOffice: 'TEST TAX OFFICE'
  }
})
assert.ok(noiseRendered.includes('SYNTHETIC OWNER'))
assert.ok(noiseRendered.includes('SYNTHETIC CITY'))
assert.ok(!noiseRendered.includes('{{owner.'))

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

const greekMappings = {
  'ΗΜΕΡΟΜΗΝΙΑ_ΣΥΜΒΑΝΤΟΣ': 'incident.date',
  'ΩΡΑ_ΣΥΜΒΑΝΤΟΣ': 'incident.time',
  'ΤΟΠΟΣ_ΣΥΜΒΑΝΤΟΣ': 'case.location',
  'ΑΦΟΡΜΗ_ΕΛΕΓΧΟΥ': 'case.notes',
  'ΥΠΗΡΕΣΙΑ_ΕΛΕΓΧΟΥ': 'officerA.service',
  'ΩΡΑ_ΑΠΟΛΥΣΗΣ': 'timeline.release.startTime',
  'ΗΜΕΡΟΜΗΝΙΑ_ΑΠΟΛΥΣΗΣ': 'case.releaseDate',
  'ΑΡΜΟΔΙΟΣ_ΕΙΣΑΓΓΕΛΕΑΣ': 'case.prosecutor'
}
for (const [greek, field] of Object.entries(greekMappings)) {
  assert.ok(narcoticsSubmission.fields.includes(field), `narcotics-08 declares ${field}`)
  assert.equal(narcoticsSubmission.mappings[greek], field, `Greek placeholder ${greek} maps to ${field}`)
}
const narcoticsParts = getTemplateParts(narcoticsSubmission)
const narcoticsXml = new TextDecoder().decode(narcoticsParts['word/document.xml'])
const narcoticsRendered = replaceInXml(narcoticsXml, narcoticsSubmission, {
  date: '2026-11-06',
  incidentDate: '2026-11-06',
  incidentTime: '13:30',
  location: 'SYNTHETIC LOCATION',
  notes: 'SYNTHETIC REASON',
  officerA: { service: 'SYNTHETIC POLICE SERVICE' },
  releaseDate: '2026-11-06',
  timeline: { releaseStartTime: '15:00' },
  prosecutor: 'SYNTHETIC PROSECUTOR',
  protocolNumber: 'TEST/1',
  evidence: 'TEST EVIDENCE',
  offender: {}
})
for (const greek of Object.keys(greekMappings)) {
  assert.ok(!narcoticsRendered.includes(`{{${greek}}}`), `Greek placeholder ${greek} is resolved`)
}
assert.ok(narcoticsRendered.includes('Χημική Υπηρεσία Καλαμάτας'))

const greekPlaceholderXml = '<w:p><w:r><w:t>{{ΑΡΜΟΔΙΟΣ_ΕΙΣΑΓΓΕΛΕΑΣ}}</w:t></w:r></w:p>'
const rendered = replaceInXml(greekPlaceholderXml, { mappings: { 'ΑΡΜΟΔΙΟΣ_ΕΙΣΑΓΓΕΛΕΑΣ': 'case.prosecutor' } }, { prosecutor: 'Εισαγγελία Πρωτοδικών' })
assert.ok(rendered.includes('Εισαγγελία Πρωτοδικών'), 'Greek placeholder identifiers are recognized and mapped')
assert.ok(!rendered.includes('{{ΑΡΜΟΔΙΟΣ_ΕΙΣΑΓΓΕΛΕΑΣ}}'), 'Greek placeholder is not left unresolved')

console.log('Template privacy/synchronization regressions passed.')
