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
  { id: 'plate', label: 'Πιθανός αριθμός κυκλοφορίας', placeholder: 'vehicle.plate', pattern: /\b([ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ]{3}\s?\d{4})\b/giu, capture: 1 },
  { id: 'full-name', label: 'Ονοματεπώνυμο (χρειάζεται ανθρώπινη επιβεβαίωση)', placeholder: 'person.fullName', pattern: /(?:ονοματεπώνυμο|ονοματεπωνυμο)\s*[:：-]?\s*([\p{Lu}][\p{L}'’΄-]+(?:\s+[\p{Lu}][\p{L}'’΄-]+){1,3})/giu, capture: 1 }
];

function textNodes(paragraph) {
  return [...paragraph.matchAll(/(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/gu)].map((match) => ({
    open: match[1], value: decodeXml(match[2]), close: match[3]
  }));
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
    let last = first;
    for (let index = first; index < positions.length; index++) {
      if (match.start < positions[index].end && match.end > positions[index].start) last = index;
    }
    if (first < 0) continue;
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
    if (!candidate || !candidate.partName || !candidate.value || !candidate.placeholder) continue;
    if (!grouped.has(candidate.partName)) grouped.set(candidate.partName, new Map());
    const byValue = grouped.get(candidate.partName);
    // Conflicting classifications for the same text are deliberately not guessed.
    if (byValue.has(candidate.value) && byValue.get(candidate.value) !== candidate.placeholder) {
      throw new Error('Conflicting anonymization placeholders for the same text');
    }
    byValue.set(candidate.value, candidate.placeholder);
  }
  for (const [partName, replacements] of grouped) {
    if (!output[partName]) continue;
    let xml = new TextDecoder().decode(output[partName]);
    xml = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gu, (paragraph) => {
      let updated = paragraph;
      for (const [value, placeholder] of replacements) {
        updated = replaceParagraphText(updated, value, placeholder);
      }
      return updated;
    });
    output[partName] = new TextEncoder().encode(xml);
  }
  return output;
}
