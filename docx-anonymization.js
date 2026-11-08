const decodeXml = (value) => String(value ?? '')
  .replace(/&apos;/gu, "'").replace(/&quot;/gu, '"')
  .replace(/&gt;/gu, '>').replace(/&lt;/gu, '<').replace(/&amp;/gu, '&');
const encodeXml = (value) => String(value ?? '').replace(/[&<>"']/gu, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
})[character]);

const RULES = [
  { id: 'email', label: 'Διεύθυνση email', placeholder: 'person.email', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu },
  { id: 'tax-id', label: 'Πιθανός Α.Φ.Μ.', placeholder: 'person.taxId', pattern: /(?:Α\.\s*Φ\.\s*Μ\.?|ΑΦΜ)\s*[:#-]?\s*(\d{9})/giu, capture: 1 },
  { id: 'identity', label: 'Αριθμός ταυτότητας / εγγράφου', placeholder: 'person.idNumber', pattern: /(?:Α\.\s*Δ\.\s*Τ\.?|ΑΔΤ|δελτίο\s+ταυτότητας|αριθμός\s+ταυτότητας|διαβατήριο)\s*[:#-]?\s*([A-ZΑ-Ω]{1,3}\s?\d{5,9})/giu, capture: 1 },
  { id: 'phone', label: 'Τηλέφωνο', placeholder: 'person.phone', pattern: /(?:τηλ(?:έφωνο)?|κιν(?:ητό)?|mobile|phone)\s*[:#-]?\s*((?:\+30\s*)?(?:69\d{8}|2\d{9}|\d{10}))/giu, capture: 1 },
  { id: 'plate', label: 'Πιθανός αριθμός κυκλοφορίας', placeholder: 'vehicle.registration', pattern: /(?<![\p{L}\p{N}])([ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ]{3}\s?\d{4})(?![\p{L}\p{N}])/giu, capture: 1 },
  { id: 'full-name', label: 'Ονοματεπώνυμο (χρειάζεται ανθρώπινη επιβεβαίωση)', placeholder: 'person.fullName', pattern: /(?:ονοματεπώνυμο|ονοματεπωνυμο)\s*[:：-]?\s*([\p{Lu}][\p{L}'’΄-]+(?:\s+[\p{Lu}][\p{L}'’΄-]+){1,3})/giu, capture: 1 }
];

function textNodes(paragraph) {
  return [...paragraph.matchAll(/(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/gu)].map((match) => ({
    open: match[1], value: decodeXml(match[2]), close: match[3]
  }));
}

function replaceParagraphRange(paragraph, start, end, replacement) {
  const nodes = textNodes(paragraph);
  if (!nodes.length || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return paragraph;
  const positions = []; let offset = 0;
  for (const node of nodes) { positions.push({ start: offset, end: offset + node.value.length }); offset += node.value.length; }
  if (end > offset) throw new Error('DOCX replacement range is outside the paragraph text.');
  const first = positions.findIndex((position) => start < position.end && end > position.start);
  if (first < 0) throw new Error('DOCX replacement range does not overlap a text run.');
  let last = first;
  for (let index = first; index < positions.length; index++) if (start < positions[index].end && end > positions[index].start) last = index;
  const values = nodes.map((node) => node.value);
  const firstOffset = start - positions[first].start, lastOffset = end - positions[last].start;
  if (first === last) values[first] = values[first].slice(0, firstOffset) + replacement + values[first].slice(lastOffset);
  else { values[first] = values[first].slice(0, firstOffset) + replacement; for (let index = first + 1; index < last; index++) values[index] = ''; values[last] = values[last].slice(lastOffset); }
  let index = 0;
  return paragraph.replace(/(<w:t\\b[^>]*>)[\\s\\S]*?(<\\/w:t>)/gu, (_match, open, close) => {
    const value = values[index++];
    const hasEdgeWhitespace = /^\\s|\\s$/u.test(value);
    const safeOpen = hasEdgeWhitespace
      ? (/\\bxml:space="/u.test(open)
        ? open.replace(/\\bxml:space="[^"]*"/u, 'xml:space="preserve"')
        : open.replace(/>$/u, ' xml:space="preserve">'))
      : open;
    return safeOpen + encodeXml(value) + close;
  });
}
function replaceParagraphText(paragraph, search, replacement) {
  const nodes = textNodes(paragraph);
  if (!nodes.length) return paragraph;
  const plain = nodes.map((node) => node.value).join('');
  const positions = [];
  let offset = 0;
  for (const node of nodes) {
    positions.push({ start: offset, end: offset + node.value.length });
    offset += node.value.length;
  }
  const matches = [];
  let at = 0;
  while ((at = plain.indexOf(search, at)) !== -1) {
    matches.push({ start: at, end: at + search.length });
    at += Math.max(1, search.length);
  }
  if (!matches.length) return paragraph;
  const values = nodes.map((node) => node.value);
  for (const match of matches.reverse()) {
    const first = positions.findIndex((position) => match.start < position.end && match.end > position.start);
    if (first < 0) continue;
    let last = first;
    for (let index = first; index < positions.length; index++) {
      if (match.start < positions[index].end && match.end > positions[index].start) last = index;
    }
    const firstOffset = match.start - positions[first].start;
    const lastOffset = match.end - positions[last].start;
    if (first === last) {
      values[first] = values[first].slice(0, firstOffset) + replacement + values[first].slice(lastOffset);
    } else {
      values[first] = values[first].slice(0, firstOffset) + replacement;
      for (let index = first + 1; index < last; index++) values[index] = '';
      values[last] = values[last].slice(lastOffset);
    }
  }
  let index = 0;
  return paragraph.replace(/(<w:t\b[^>]*>)[\s\S]*?(<\/w:t>)/gu, (_match, open, close) =>
    open + encodeXml(values[index++]) + close
  );
}

export function detectDocxPersonalData(parts) {
  const candidates = [];
  for (const [partName, bytes] of Object.entries(parts || {})) {
    if (!partName.startsWith('word/') || !partName.endsWith('.xml')) continue;
    const xml = new TextDecoder().decode(bytes);
    const paragraphs = [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gu)];
    paragraphs.forEach((paragraphMatch, paragraphIndex) => {
      const paragraph = paragraphMatch[0];
      const plainText = textNodes(paragraph).map((node) => node.value).join('');
      for (const rule of RULES) {
        rule.pattern.lastIndex = 0;
        for (const match of plainText.matchAll(rule.pattern)) {
          const value = match[rule.capture || 0];
          if (!value || value.length < 3) continue;
          candidates.push({
            id: [partName, paragraphIndex, rule.id, value].join(':'),
            partName,
            paragraphIndex,
            category: rule.id,
            label: rule.label,
            value,
            placeholder: '{{' + rule.placeholder + '}}',
            // Names and unlabelled plates are suggestions only; all changes require review.
            confidence: rule.id === 'full-name' || rule.id === 'plate' ? 'review' : 'high'
          });
        }
      }
    });
  }
  const unique = new Map();
  for (const candidate of candidates) unique.set(candidate.id, candidate);
  return [...unique.values()];
}

export function anonymizeDocxParts(parts, approvedCandidates) {
  const output = Object.fromEntries(Object.entries(parts || {}).map(([name, bytes]) => [name, new Uint8Array(bytes)]));
  const grouped = new Map();
  for (const candidate of approvedCandidates || []) {
    if (!candidate || !candidate.partName || !Number.isInteger(candidate.paragraphIndex) || !candidate.value || !candidate.placeholder) continue;
    if (!grouped.has(candidate.partName)) grouped.set(candidate.partName, new Map());
    const paragraphs = grouped.get(candidate.partName);
    if (!paragraphs.has(candidate.paragraphIndex)) paragraphs.set(candidate.paragraphIndex, { ranges: [], byValue: new Map() });
    const replacements = paragraphs.get(candidate.paragraphIndex);
    if (Number.isInteger(candidate.start) && Number.isInteger(candidate.end)) {
      if (candidate.end <= candidate.start) throw new Error('Invalid DOCX replacement range.');
      const duplicate = replacements.ranges.find((entry) => entry.start === candidate.start && entry.end === candidate.end);
      if (duplicate && duplicate.placeholder !== candidate.placeholder) throw new Error('Conflicting anonymization placeholders for the same text position');
      if (!duplicate) replacements.ranges.push({ start: candidate.start, end: candidate.end, value: candidate.value, placeholder: candidate.placeholder });
      continue;
    }
    if (replacements.byValue.has(candidate.value) && replacements.byValue.get(candidate.value) !== candidate.placeholder) throw new Error('Conflicting anonymization placeholders for the same text');
    replacements.byValue.set(candidate.value, candidate.placeholder);
  }
  for (const [partName, paragraphReplacements] of grouped) {
    if (!output[partName]) continue;
    let paragraphIndex = 0, xml = new TextDecoder().decode(output[partName]);
    xml = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gu, (paragraph) => {
      const replacements = paragraphReplacements.get(paragraphIndex++);
      if (!replacements) return paragraph;
      let updated = paragraph;
      const originalText = textNodes(paragraph).map((node) => node.value).join('');
      for (const range of [...replacements.ranges].sort((left, right) => right.start - left.start)) {
        if (originalText.slice(range.start, range.end) !== range.value) throw new Error('DOCX replacement position no longer matches the reviewed text.');
        updated = replaceParagraphRange(updated, range.start, range.end, range.placeholder);
      }
      for (const [value, placeholder] of replacements.byValue) updated = replaceParagraphText(updated, value, placeholder);
      return updated;
    });
    output[partName] = new TextEncoder().encode(xml);
  }
  return output;
}

export function detectDottedPlaceholderCandidates(parts) {
  const candidates = [];
  for (const [partName, bytes] of Object.entries(parts || {})) {
    if (!partName.startsWith('word/') || !partName.endsWith('.xml')) continue;
    const xml = new TextDecoder().decode(bytes);
    const paragraphs = [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gu)];
    paragraphs.forEach((paragraphMatch, paragraphIndex) => {
      const plainText = textNodes(paragraphMatch[0]).map((node) => node.value).join('');
      for (const [occurrenceIndex, match] of [...plainText.matchAll(/(?:\.{2,}|…+)/gu)].entries()) {
        candidates.push({ id: [partName, paragraphIndex, 'dotted', occurrenceIndex, match.index].join(':'), partName, paragraphIndex, category: 'dotted-placeholder', label: 'Κενή θέση εντύπου', value: match[0], start: match.index, end: match.index + match[0].length, contextBefore: plainText.slice(Math.max(0, match.index - 45), match.index), contextAfter: plainText.slice(match.index + match[0].length, match.index + match[0].length + 45), occurrenceIndex, confidence: 'review' });
      }
    });
  }
  return candidates;
}
export function createManualAnonymizationCandidates(parts, entries) {
  const candidates = [];
  for (const entry of entries || []) {
    const value = String(entry && entry.value || '').trim();
    const placeholder = String(entry && entry.placeholder || '').trim();
    if (!value || !/^\{\{[\p{L}\p{N}_.-]+\}\}$/u.test(placeholder)) continue;
    for (const [partName, bytes] of Object.entries(parts || {})) {
      if (!partName.startsWith('word/') || !partName.endsWith('.xml')) continue;
      const xml = new TextDecoder().decode(bytes);
      const paragraphs = [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gu)];
      paragraphs.forEach((paragraphMatch, paragraphIndex) => {
        const plainText = textNodes(paragraphMatch[0]).map((node) => node.value).join('');
        if (plainText.includes(value)) {
          candidates.push({
            id: [partName, paragraphIndex, 'manual', value, placeholder].join(':'),
            partName, paragraphIndex, category: 'manual',
            label: 'Χειροκίνητη αντικατάσταση',
            value, placeholder, confidence: 'user'
          });
        }
      });
    }
  }
  return candidates;
}
