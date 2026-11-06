import assert from 'node:assert/strict';
import { DEFAULT_NARCOTICS_TEMPLATES } from '../dossier-templates-data.js';
import { getTemplateParts } from '../template-library.js';
import { strFromU8 } from '../vendor/fflate.js';

function paragraphs(template) {
  const xml = strFromU8(getTemplateParts(template)['word/document.xml']);
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gu)].map((match, index) => {
    const p = match[0];
    const text = [...p.matchAll(/<(?:w|a):t\b[^>]*>([\s\S]*?)<\/(?:w|a):t>/gu)]
      .map((part) => part[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
      .join('');
    return { index, p, text };
  });
}

const dateForm = DEFAULT_NARCOTICS_TEMPLATES.find((item) => item.id === 'narcotics-10');
const arrestForm = DEFAULT_NARCOTICS_TEMPLATES.find((item) => item.id === 'narcotics-02');
assert.ok(dateForm && arrestForm);
const dateFindings = paragraphs(dateForm)
  .filter(({ text }) => /\.{3,}/u.test(text))
  .map(({ index, p, text }) => ({
    index,
    dotRuns: [...text.matchAll(/\.{3,}/gu)].map((match) => match[0].length),
    dateCue: /ημερομην|ημέρα|τόπος|χρόνος|ώρα|ηλικία/iu.test(text),
    slash: text.includes('/'),
    runs: (p.match(/<w:r\b/g) || []).length,
    hasDatePlaceholder: /\{\{[^}]+\}\}/u.test(text)
  }));
const signatureFindings = paragraphs(arrestForm)
  .filter(({ text }) => /υπογραφ|ανακρι|αξιωματ|βεβαι|συντάξ|μάρτυρ/iu.test(text))
  .map(({ index, p, text }) => ({
    index,
    cue: ['υπογραφή','ανακριτικός','αξιωματικός','βεβαιώνω','συντάξας','μάρτυρας'].find((word) => text.toLocaleLowerCase('el-GR').includes(word)) || 'signature-context',
    spaces: (text.match(/ {2,}/g) || []).map((run) => run.length),
    tabs: (text.match(/\t/g) || []).length + (p.match(/<w:tab\b/g) || []).length,
    runs: (p.match(/<w:r\b/g) || []).length,
    hasTabStops: /<w:tabs\b/.test(p),
    insideTable: false,
    hasOfficerA: text.includes('{{officerA.fullName}}'),
    hasOfficerB: text.includes('{{officerB.fullName}}'),
    hasServiceA: text.includes('{{officerA.service}}'),
    hasServiceB: text.includes('{{officerB.service}}'),
    safeText: text.replace(/\{\{[^}]+\}\}/gu, '[FIELD]'),
    placeholders: [...text.matchAll(/\{\{([^}]+)\}\}/gu)].map((match) => match[1])
  }));
console.log('NARCOTICS_10_LAYOUT_DIAGNOSTIC', JSON.stringify(dateFindings));
console.log('NARCOTICS_02_SIGNATURE_DIAGNOSTIC', JSON.stringify(signatureFindings));
const dateParts = getTemplateParts(dateForm);
const datePartFindings = Object.entries(dateParts)
  .filter(([name]) => name.startsWith('word/') && name.endsWith('.xml'))
  .flatMap(([name, bytes]) => {
    const xml = strFromU8(bytes);
    const text = [...xml.matchAll(/<(?:w|a):t\b[^>]*>([\s\S]*?)<\/(?:w|a):t>/gu)].map((part) => part[1]).join('');
    const runs = [...text.matchAll(/(?:\.{3,}|…{2,}|·{3,}|_{3,})/gu)].map((match) => match[0].length);
    return runs.length ? [{ name, runs, dateCue: /ημερομην|ημέρα|τόπος|χρόνος|ώρα|ηλικία/iu.test(text) }] : [];
  });
console.log('NARCOTICS_10_ALL_XML_DOTS', JSON.stringify(datePartFindings));
console.log('NARCOTICS_10_XML_PARTS', JSON.stringify(Object.keys(dateParts).filter((name) => name.startsWith('word/') && name.endsWith('.xml'))));
const dateXml = strFromU8(dateParts['word/document.xml']);
const dateTextNodes = [...dateXml.matchAll(/<(?:w|a):t\b[^>]*>([\s\S]*?)<\/(?:w|a):t>/gu)].map((part) => part[1]);
const dottedTextNodes = dateTextNodes.flatMap((text, index) => {
  const runs = [...text.matchAll(/(?:\.{3,}|…{2,}|·{3,}|_{3,})/gu)].map((match) => match[0].length);
  if (!runs.length) return [];
  const nearby = dateTextNodes.slice(Math.max(0, index - 3), index).join(' ');
  return [{
    index,
    runs,
    nearbyDateCue: /ημερομην|ημέρα|τόπος|χρόνος|ώρα|ηλικία/iu.test(nearby),
    nearbyProtocolCue: /αριθμ|πρωτοκόλλ|υπόθεση/iu.test(nearby),
    currentDateCue: /ημερομην|ημέρα|τόπος|χρόνος|ώρα|ηλικία/iu.test(text),
    safeText: text.replace(/\.{3,}/gu, '[blank]').replace(/\{\{[^}]+\}\}/gu, '[field]')
  }];
});
console.log('NARCOTICS_10_XML_STRUCTURE', JSON.stringify({
  paragraphStarts: (dateXml.match(/<w:p\b/g) || []).length,
  paragraphEnds: (dateXml.match(/<\/w:p>/g) || []).length,
  textNodes: dateTextNodes.length,
  dottedTextNodes
}));
function textFor(id) {
  const template = DEFAULT_NARCOTICS_TEMPLATES.find((item) => item.id === id);
  return Object.entries(getTemplateParts(template))
    .filter(([name]) => name.startsWith('word/') && name.endsWith('.xml'))
    .map(([name, bytes]) => ({ name, text: [...strFromU8(bytes).matchAll(/<(?:w|a):t\b[^>]*>([\s\S]*?)<\/(?:w|a):t>/gu)].map((part) => part[1]).join('') }))
    .map(({ name, text }) => ({ name, text }));
}
const chemicalText = textFor('narcotics-09').map((part) => part.text).join(' ');
const prosecutorText = textFor('narcotics-08').map((part) => part.text).join(' ');
console.log('NARCOTICS_09_RECIPIENT_INFO', JSON.stringify({
  byronosStreet: chemicalText.includes('Βύρωνος'),
  portParkStreet: chemicalText.includes('Πάρκο Λιμενικού'),
  oldPostalCode: chemicalText.includes('241 00'),
  newPostalCode: chemicalText.includes('24131'),
  email: chemicalText.includes('kalamata.gcsl@aade.gr'),
  phonePrefix: chemicalText.includes('27213'),
  aadeServiceLabel: chemicalText.includes('Χημική Υπηρεσία')
}));
function mediaInfo(id) {
  const template = DEFAULT_NARCOTICS_TEMPLATES.find((item) => item.id === id);
  return Object.entries(getTemplateParts(template))
    .filter(([name]) => name.startsWith('word/media/'))
    .map(([name, bytes]) => ({
      name,
      size: bytes.length,
      type: bytes[0] === 0x89 && bytes[1] === 0x50 ? 'png' : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'jpeg' : 'other'
    }));
}
console.log('NARCOTICS_09_MEDIA_INFO', JSON.stringify(mediaInfo('narcotics-09')));
console.log('NARCOTICS_08_MEDIA_INFO', JSON.stringify(mediaInfo('narcotics-08')));
function serviceLines(id) {
  const template = DEFAULT_NARCOTICS_TEMPLATES.find((item) => item.id === id);
  return Object.entries(getTemplateParts(template))
    .filter(([name]) => name.startsWith('word/') && name.endsWith('.xml'))
    .flatMap(([name, bytes]) => [...strFromU8(bytes).matchAll(/<(?:w|a):t\\b[^>]*>([\\s\\S]*?)<\\/(?:w|a):t>/gu)].map((part) => part[1]))
    .filter((value) => /Εισαγγελ|Κυπαρισ|Χημικ|Καλαμάτ|διεύθυν|τηλέφων|email|241\\s*00|24500/iu.test(value))
    .map((value) => value.replace(/\\{\\{[^}]+\\}\\}/gu, '[FIELD]'));
}
console.log('NARCOTICS_09_SERVICE_TEXT', JSON.stringify(serviceLines('narcotics-09')));
console.log('NARCOTICS_08_SERVICE_TEXT', JSON.stringify(serviceLines('narcotics-08')));
console.log('NARCOTICS_08_PROSECUTOR_INFO', JSON.stringify({
  kyparissiaAddress: prosecutorText.includes('25ης Μαρτίου'),
  postalCode: prosecutorText.includes('24500'),
  phonePrefix: prosecutorText.includes('276102'),
  emailDomain: prosecutorText.includes('eisaggeliaprotodikon-kyparissias.gov.gr'),
  prosecutorLabel: prosecutorText.includes('Εισαγγελία')
}));
console.log('NARCOTICS_10_FIELDS', JSON.stringify(dateForm.fields));
console.log('NARCOTICS_02_FIELDS', JSON.stringify(arrestForm.fields));
