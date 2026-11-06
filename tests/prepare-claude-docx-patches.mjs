import assert from 'node:assert/strict';
import { DEFAULT_NARCOTICS_TEMPLATES } from '../dossier-templates-data.js';
import { getTemplateParts } from '../template-library.js';
import { strFromU8, strToU8, zipSync } from '../vendor/fflate.js';

function template(id) {
  const found = DEFAULT_NARCOTICS_TEMPLATES.find((item) => item.id === id);
  assert.ok(found, `Missing template ${id}`);
  return found;
}
function p(text) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="80" w:after="80"/></w:pPr><w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
}
function cell(label, field) {
  return `<w:tc><w:tcPr><w:tcW w:w="4680" w:type="dxa"/><w:vAlign w:val="center"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr>${p(label)}${p('________________________')}${p(`{{${field}}}`)}</w:tc>`;
}
function signatureTable() {
  const nil = '<w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/>';
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/><w:tblBorders>${nil}</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4680"/><w:gridCol w:w="4680"/></w:tblGrid><w:tr>${cell('Ο Συλλαβών','case.arrestingOfficer')}${cell('Ο Συλληφθείς','person.fullName')}</w:tr><w:tr>${cell('Ο Β΄ Ανακριτικός Υπάλληλος','officerB.fullName')}${cell('Ο Α΄ Ανακριτικός Υπάλληλος','officerA.fullName')}</w:tr></w:tbl>`;
}
function patchDocx(id, patch) {
  const parts = getTemplateParts(template(id));
  const documentPath = 'word/document.xml';
  let xml = strFromU8(parts[documentPath]);
  const before = xml;
  xml = patch(xml);
  assert.notEqual(xml, before, `No changes were applied to ${id}`);
  parts[documentPath] = strToU8(xml);
  return zipSync(parts);
}

const narcotics02 = patchDocx('narcotics-02', (xml) => {
  const oldService = 'της ίδιας Υπηρεσίας, που προσλήφθηκε ως Β’ Ανακριτικός Υπάλληλος, κάτοικων Α.Τ. Τριφυλίας';
  assert.ok(xml.includes(oldService), 'Expected the legacy investigator-B service wording');
  xml = xml.replace(oldService, 'που υπηρετεί στο {{officerB.service}} και ενεργεί ως Β΄ Ανακριτικός Υπάλληλος');
  const paragraphs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gu)];
  const signature = paragraphs.find((match) => match[0].includes('Ο  Συλλαβών'));
  assert.ok(signature, 'Expected the existing four-signature paragraph');
  return xml.replace(signature[0], signatureTable());
});
const narcotics08 = patchDocx('narcotics-08', (xml) => {
  const pattern = /Εισαγγελία Πρωτοδικών\s*\.{5,}/u;
  assert.ok(pattern.test(xml), 'Expected the blank prosecutor recipient line');
  return xml.replace(pattern, 'Εισαγγελία Πρωτοδικών {{case.prosecutor}}');
});
const narcotics09 = patchDocx('narcotics-09', (xml) => {
  const pattern = /ΚΑΛΑΜΑΤΑ\s+Τ\.Κ\.\s*241\s*00/u;
  assert.ok(pattern.test(xml), 'Expected the outdated Kalamata postal code');
  return xml.replace(pattern, 'Πάρκο Λιμενικού, Τ.Κ. 24131, Καλαμάτα');
});

for (const [id, bytes] of [['narcotics-02', narcotics02], ['narcotics-08', narcotics08], ['narcotics-09', narcotics09]]) {
  console.log(`PATCHED_${id.toUpperCase().replace(/-/g,'')}_BASE64:${Buffer.from(bytes).toString('base64')}`);
  console.log(`PATCHED_${id.toUpperCase().replace(/-/g,'')}_SIZE:${bytes.length}`);
}
