import assert from 'node:assert/strict';
import { DEFAULT_NARCOTICS_TEMPLATES } from '../dossier-templates-data.js';
import { getTemplateParts } from '../template-library.js';
import { strFromU8 } from '../vendor/fflate.js';

function paragraphs(template) {
  const xml = strFromU8(getTemplateParts(template)['word/document.xml']);
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gu)].map((match, index) => {
    const p = match[0];
    const text = [...p.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gu)]
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
    insideTable: false
  }));
console.log('NARCOTICS_10_LAYOUT_DIAGNOSTIC', JSON.stringify(dateFindings));
console.log('NARCOTICS_02_SIGNATURE_DIAGNOSTIC', JSON.stringify(signatureFindings));
const dateParts = getTemplateParts(dateForm);
const datePartFindings = Object.entries(dateParts)
  .filter(([name]) => name.startsWith('word/') && name.endsWith('.xml'))
  .flatMap(([name, bytes]) => {
    const xml = strFromU8(bytes);
    const text = [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gu)].map((part) => part[1]).join('');
    const runs = [...text.matchAll(/(?:\.{3,}|…{2,}|·{3,}|_{3,})/gu)].map((match) => match[0].length);
    return runs.length ? [{ name, runs, dateCue: /ημερομην|ημέρα|τόπος|χρόνος|ώρα|ηλικία/iu.test(text) }] : [];
  });
console.log('NARCOTICS_10_ALL_XML_DOTS', JSON.stringify(datePartFindings));
console.log('NARCOTICS_10_XML_PARTS', JSON.stringify(Object.keys(dateParts).filter((name) => name.startsWith('word/') && name.endsWith('.xml'))));
console.log('NARCOTICS_10_FIELDS', JSON.stringify(dateForm.fields));
console.log('NARCOTICS_02_FIELDS', JSON.stringify(arrestForm.fields));
