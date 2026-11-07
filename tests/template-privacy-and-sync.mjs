import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { replaceInXml, getTemplateParts } from '../template-library.js'
import { DEFAULT_NOISE_TEMPLATES } from '../noise-templates-data.js'
import { DEFAULT_CAMPING_TEMPLATES } from '../camping-templates-data.js'
import { DEFAULT_NARCOTICS_TEMPLATES } from '../template-data/narcotics.js'
import { DEFAULT_COUNTERFEIT_TEMPLATES } from '../template-data/counterfeit.js'
import { DEFAULT_ENVIRONMENT_TEMPLATES } from '../template-data/environment.js'
import { DEFAULT_HEALTH_TEMPLATES } from '../template-data/health.js'

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

const noiseExamination = DEFAULT_NOISE_TEMPLATES.find((template) => template.id === 'noise-02')
assert.ok(noiseExamination.fields.includes('officerB.service'))
assert.equal(noiseExamination.mappings['officerB.service'], 'officerB.service')
const noiseExaminationXml = new TextDecoder().decode(getTemplateParts(noiseExamination)['word/document.xml'])
assert.ok(noiseExaminationXml.includes('{{officerB.service}}'), 'noise-02 uses the B investigator service field')

for (const id of ['counterfeit-01', 'counterfeit-02']) {
  const template = DEFAULT_COUNTERFEIT_TEMPLATES.find((entry) => entry.id === id)
  assert.ok(template.fields.includes('officerB.service'), `${id} declares the B investigator service`)
  assert.equal(template.mappings['officerB.service'], 'officerB.service')
  const xml = new TextDecoder().decode(getTemplateParts(template)['word/document.xml'])
  assert.ok(xml.includes('{{officerB.service}}'), `${id} uses the B investigator service placeholder`)
}
const counterfeit01 = DEFAULT_COUNTERFEIT_TEMPLATES.find((entry) => entry.id === 'counterfeit-01')
const counterfeit01Xml = new TextDecoder().decode(getTemplateParts(counterfeit01)['word/document.xml'])
assert.ok(counterfeit01Xml.includes('{{counterfeit.serialNumber}}'), 'counterfeit-01 includes the serial number in the document text')
globalThis.window = {
  AXYP_SERVICE_PROFILE: {
    get: () => ({ name: 'SERVICE A', operator: 'TEST A OFFICER ONE' })
  }
}
const counterfeit01Rendered = replaceInXml(counterfeit01Xml, counterfeit01, {
  counterfeit: { serialNumber: 'TEST-SERIAL-123' },
  evidence: 'TEST DENOMINATION',
  // Investigator A identity and service are now sourced only from this
  // installation profile; stale per-case investigator-A data must be ignored.
  officerA: { rank: 'STALE CASE RANK', surname: 'STALE CASE OFFICER', name: 'STALE CASE NAME', service: 'STALE CASE SERVICE A' },
  officerB: { rank: 'TEST B', surname: 'OFFICER', name: 'TWO', service: 'SERVICE B' }
})
assert.ok(counterfeit01Rendered.includes('TEST-SERIAL-123'))
assert.ok(counterfeit01Rendered.includes('SERVICE A'))
assert.ok(!counterfeit01Rendered.includes('STALE CASE SERVICE A'))
assert.ok(counterfeit01Rendered.includes('SERVICE B'))
assert.ok(!counterfeit01Rendered.includes('{{counterfeit.serialNumber}}'))

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
for (const field of ['case.location', 'case.notes', 'incident.date', 'incident.time', 'officerA.service', 'timeline.release.startTime', 'case.releaseDate', 'case.prosecutor']) {
  assert.ok(narcoticsSubmission.fields.includes(field), `narcotics-08 declares ${field}`)
  assert.equal(narcoticsSubmission.mappings[field], field)
}

for (const id of ['narcotics-02', 'narcotics-03', 'narcotics-04', 'narcotics-06', 'narcotics-08']) {
  const template = DEFAULT_NARCOTICS_TEMPLATES.find((entry) => entry.id === id)
  assert.ok(template, `${id} exists`)
  const xml = new TextDecoder().decode(getTemplateParts(template)['word/document.xml'])
  assert.ok(!xml.includes('3459/06'), `${id} no longer cites the repealed article numbering`)
  assert.ok(!xml.includes('άρθρο 38'), `${id} does not misidentify old article 38 as the current offence provision`)
}
const notificationTemplate = DEFAULT_NARCOTICS_TEMPLATES.find((entry) => entry.id === 'narcotics-04')
const notificationXml = new TextDecoder().decode(getTemplateParts(notificationTemplate)['word/document.xml'])
assert.ok(notificationXml.includes('άρθρο 41 παρ. 2 του Ν. 4139/2013'), 'narcotics notification cites the current procedural notice provision')
assert.ok(notificationXml.includes('των διατάξεων του Ν. 4139/2013'), 'narcotics notification refers to the current law')
for (const id of ['narcotics-02', 'narcotics-03', 'narcotics-06', 'narcotics-08']) {
  const template = DEFAULT_NARCOTICS_TEMPLATES.find((entry) => entry.id === id)
  const xml = new TextDecoder().decode(getTemplateParts(template)['word/document.xml'])
  assert.ok(xml.includes('άρθρου ........ του Ν. 4139/2013'), `${id} leaves the fact-dependent substantive article for officer selection`)
}

const dateValue = '2026-11-06'
const expectedDate = new Intl.DateTimeFormat('el-GR', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  weekday: 'long'
}).formatToParts(new Date(Date.UTC(2026, 10, 6, 12)))
const expectedDateParts = Object.fromEntries(expectedDate.filter((part) => ['day', 'month', 'year', 'weekday'].includes(part.type)).map((part) => [part.type, part.value]))
for (const id of ['narcotics-01', 'narcotics-06']) {
  const template = DEFAULT_NARCOTICS_TEMPLATES.find((entry) => entry.id === id)
  for (const field of ['case.date.day', 'case.date.monthName', 'case.date.year', 'case.date.weekdayName']) {
    assert.ok(template.fields.includes(field), `${id} declares derived date field ${field}`)
    assert.equal(template.mappings[field], field)
  }
  const xml = new TextDecoder().decode(getTemplateParts(template)['word/document.xml'])
  const rendered = replaceInXml(xml, template, { date: dateValue, timeline: { witnessStartTime: '12:00', examinationStartTime: '12:00' } })
  for (const value of Object.values(expectedDateParts)) assert.ok(rendered.includes(value), `${id} renders derived Greek date component ${value}`)
  for (const field of ['day', 'monthName', 'year', 'weekdayName']) assert.ok(!rendered.includes(`{{case.date.${field}}}`))
}

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

const storageSource = await readFile(path.join(root, 'storage.js'), 'utf8')
const hypothesesSource = await readFile(path.join(root, 'hypotheses.js'), 'utf8')
assert.match(storageSource, /onChange:/, 'storage exposes a change listener contract')
assert.match(storageSource, /notifyChange\(message\.key/, 'remote storage changes notify subscribers')
assert.match(storageSource, /deleted: true/, 'storage persists deletion tombstones')
assert.match(hypothesesSource, /AXYP_STORAGE\.onChange/, 'case views subscribe to remote storage changes')
assert.match(hypothesesSource, /showHypothesesConflict/, 'case views render an explicit conflict resolution flow')
assert.match(hypothesesSource, /resolveConflict\(KEY, 'local'\)/, 'case views let the user retain the local version')
assert.match(hypothesesSource, /resolveConflict\(KEY, 'remote'\)/, 'case views let the user retain the remote version')
assert.match(hypothesesSource, /remoteCaseUpdatePending/, 'stale selected case forms are protected after a remote update')
assert.match(hypothesesSource, /if \(remoteCaseUpdatePending\)[\s\S]*?return;/, 'saving a stale selected case is blocked')
assert.match(hypothesesSource, /async function snapshot\(\)[\s\S]*?if \(remoteCaseUpdatePending\)[\s\S]*?return;/, 'snapshot creation is blocked for a stale selected case')
assert.match(hypothesesSource, /activeItem\.updatedAt !== selectedCaseUpdatedAt/, 'the selected case is marked stale when another tab updates it')

console.log('Template privacy/synchronization regressions passed.')

// Keep this regression suite in the guarded template-sanitization PR workflow.

// Re-run guarded DOCX synchronization validation after workflow updates.

// The generated DOCX and embedded copies are verified by the PR workflow.

// Confirm the final incremental DOCX patch remains covered by CI.
