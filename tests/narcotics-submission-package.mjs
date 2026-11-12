import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync, unzlibSync, strFromU8 } from '../vendor/fflate.js';
import { getDossierFieldDefinitions, setDossierFieldValue } from '../dossier-fields.js';
import { buildCategoryArchive, getMissingTemplateFields, loadPublishedDossierPackages } from '../template-library.js';

const catalog = JSON.parse(await readFile(new URL('../dossier-packages/manifest.json', import.meta.url), 'utf8'));
const entry = catalog.packages.find((item) => item.id === 'narcotics-submission-v1');
assert.ok(entry);
assert.equal(entry.file, 'narcotics-submission-v1.axyp.pack.json');
const descriptorBytes = new Uint8Array(await readFile(new URL('../dossier-packages/' + entry.file, import.meta.url)));
const descriptor = JSON.parse(new TextDecoder().decode(descriptorBytes));
assert.equal(descriptor.encoding, 'base64-chunks');
assert.ok(descriptor.parts.length >= 1 && descriptor.parts.length <= 10);
const encoded = (await Promise.all(descriptor.parts.map((name) =>
  readFile(new URL('../dossier-packages/' + name, import.meta.url), 'utf8')
))).join('');
const packedBytes = new Uint8Array(Buffer.from(encoded, 'base64'));
assert.equal(packedBytes.length, descriptor.byteLength);
const packed = JSON.parse(strFromU8(unzlibSync(packedBytes)));
assert.equal(packed.schemaVersion, 1);
assert.equal(packed.category, 'narcotics');
assert.equal(packed.documents.length, 1);
const document = packed.documents[0];
assert.equal(document.id, 'narcotics-14-submission');
assert.equal(document.name, '14_ΥΠΟΒΟΛΗ_ΣΧΗΜ_ΔΙΚΟΓΡΑΦΙΑΣ.docx');
assert.deepEqual(Object.keys(document.mappings).sort(), [...document.fields].sort());

const definitions = getDossierFieldDefinitions('narcotics');
const defined = new Set(definitions.map((field) => field.path));
for (const path of [
  'narcotics.references.signalReportNumber','narcotics.references.signalReportDate',
  'narcotics.offender.profession','narcotics.prosecutor.givenNameGenitive',
  'narcotics.case.chemicalProtocolDate','narcotics.case.governmentRecordNumber',
  'narcotics.service.commanderRank'
]) assert.ok(defined.has(path), 'Missing field: ' + path);
const common = new Set([
  'service.directorate','service.name','officerA.nominativeFullName','service.phone','service.email','service.address',
  'service.location','service.prosecutor','service.chemicalService','case.protocolNumber',
  'case.date.day','case.date.monthName','case.date.year','case.releaseDate',
  'incident.time','incident.date','incident.location',
  'person.surname','person.name','person.fatherName','person.motherName','person.birthDate','person.birthPlace',
  'person.city','person.address','person.idNumber','person.idDate','person.idService','person.taxId','person.email','person.phone',
  'narcotics.service.cityUpper','narcotics.exhibits.cigarette.unit'
]);
for (const [key,target] of Object.entries(document.mappings)) {
  assert.ok(defined.has(target) || common.has(target), 'Undeclared mapping: '+key+' -> '+target);
}
const docxParts = Object.fromEntries(Object.entries(document.parts).map(([name,part]) => [
  name, part.encoding === 'utf8' ? new TextEncoder().encode(part.data) : new Uint8Array(Buffer.from(part.data,'base64'))
]));
assert.ok(docxParts['word/document.xml']);
assert.ok(docxParts['word/media/image1.png'], 'Original official emblem must be retained');
const xmlParts = Object.entries(docxParts).filter(([name]) => name.endsWith('.xml') || name.endsWith('.rels'));
for (const [name,bytes] of xmlParts) {
  const xml = new TextDecoder().decode(bytes);
  assert.doesNotMatch(xml, /\b\d{9}\b/u, 'Nine-digit identifier in '+name);
  assert.doesNotMatch(xml, /\b\d{10,13}\b/u, 'Phone-like identifier in '+name);
  assert.doesNotMatch(xml, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu, 'Email in '+name);
  assert.doesNotMatch(xml, /(?<![A-ZΑ-Ω0-9])[A-ZΑ-Ω]{1,2}\d{6,8}(?!\d)/iu, 'Identity-like value in '+name);
  assert.doesNotMatch(xml, /(?<!\d)\d{1,2}[./-]\d{1,2}[./-](?:19|20)\d{2}(?!\d)/u, 'Fixed date in '+name);
}
const mainXml = new TextDecoder().decode(docxParts['word/document.xml']);
const placeholders = [...new Set([...mainXml.matchAll(/\{\{([^{}]+)\}\}/gu)].map((match)=>match[1]))];
assert.deepEqual(placeholders.sort(), [...document.fields].sort());
assert.ok(mainXml.includes('{{officerA.nominativeFullName}}'));
assert.ok(mainXml.includes('{{narcotics.service.commanderFullName}}'));
assert.ok(mainXml.includes('{{narcotics.references.signalReportNumber}}'));
assert.ok(mainXml.includes('{{case.protocolNumber}}'));
assert.ok(mainXml.includes('{{narcotics.exhibits.cannabis.quantity}}'));
assert.ok(mainXml.includes('{{narcotics.exhibits.cigarette.quantity}}'));
assert.ok(!xmlParts.some(([,bytes])=>new TextDecoder().decode(bytes).includes('mailto:')));

const serviceProfile = {
  name:'TEST-SERVICE', directorate:'TEST-DIRECTORATE', address:'TEST-ADDRESS',
  phone:'0000000000', email:'test-service@example.invalid',
  prosecutor:'TEST-PROSECUTOR-OFFICE', chemicalService:'TEST-CHEMICAL-SERVICE',
  location:'TEST-CITY', operator:'Ανθ. ΔΟΚΙΜΑΣΤΙΚΟΣ Γεώργιος'
};
globalThis.window = { AXYP_SERVICE_PROFILE:{get:()=>serviceProfile} };
const categoryData = {};
for (const field of definitions) {
  const value = field.type === 'date' ? '2026-11-10'
    : field.type === 'time' ? '19:30'
    : field.path.endsWith('cannabis.quantity') ? '2.96'
    : field.path.endsWith('cigarette.quantity') ? '1'
    : field.type === 'textarea' ? 'TEST-STATEMENT'
    : 'TEST-' + field.path.split('.').slice(1).join('-').toUpperCase();
  setDossierFieldValue(categoryData,field.path,value);
}
const item = {
  id:'narcotics-submission-test', profile:'narcotics', date:'2026-11-11',
  releaseDate:'2026-11-10', protocolNumber:'TEST-PROTOCOL', time:'13:30', location:'TEST-INCIDENT-LOCATION',
  incident:{date:'2026-11-10',time:'13:30',location:'TEST-INCIDENT-LOCATION'},
  offender:{surname:'TEST-SURNAME',name:'TEST-NAME',fatherName:'TEST-FATHER',motherName:'TEST-MOTHER',
    birthDate:'1990-01-02',birthPlace:'TEST-BIRTH-PLACE',city:'TEST-CITY',address:'TEST-ADDRESS',
    idNumber:'TEST-ID',idDate:'2020-01-02',idService:'TEST-ID-SERVICE',taxId:'TEST-TAX',
    email:'test-person@example.invalid',phone:'0000000001'},
  categoryData
};
const originalFetch=globalThis.fetch, originalDocument=globalThis.document;
const chunkEntries = await Promise.all(descriptor.parts.map(async (name) => [
  name,
  await readFile(new URL('../dossier-packages/' + name, import.meta.url), 'utf8')
]));
const chunkText = new Map(chunkEntries);
try {
  globalThis.document={baseURI:'https://axyp-test.invalid/'};
  globalThis.fetch=async(input)=>{
    const url=new URL(input);
    if(url.pathname.endsWith('/manifest.json')) return {ok:true,json:async()=>({schemaVersion:1,packages:[entry]})};
    if(url.pathname.endsWith('/'+entry.file)) return {ok:true,arrayBuffer:async()=>descriptorBytes.buffer.slice(descriptorBytes.byteOffset,descriptorBytes.byteOffset+descriptorBytes.byteLength)};
    const name=decodeURIComponent(url.pathname.split('/').pop());
    if(chunkText.has(name)) return {ok:true,text:async()=>chunkText.get(name)};
    return {ok:false};
  };
  const loaded=await loadPublishedDossierPackages();
  assert.equal(loaded.length,1);
  assert.equal(loaded[0].id,document.id);
  assert.deepEqual(getMissingTemplateFields(loaded[0],item),[]);
  const archive=unzipSync(buildCategoryArchive(loaded,item));
  assert.equal(Object.keys(archive).length,1);
  for(const bytes of Object.values(archive)){
    const generated=unzipSync(bytes);
    const xml=Object.entries(generated).filter(([name])=>name.startsWith('word/')&&name.endsWith('.xml'))
      .map(([,value])=>new TextDecoder().decode(value)).join('\n');
    assert.doesNotMatch(xml,/\{\{\s*[\p{L}\p{N}_.-]+\s*\}\}/gu);
  }
} finally {
  globalThis.fetch=originalFetch;
  if(originalDocument===undefined) delete globalThis.document; else globalThis.document=originalDocument;
  delete globalThis.window;
}
console.log('Narcotics submission package tests passed: privacy scan, mappings, operator/commander separation, distinct references and synthetic DOCX generation.');
