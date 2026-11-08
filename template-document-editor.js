const decoder = new TextDecoder();
const encoder = new TextEncoder();

function decodeXmlText(value) {
  return String(value)
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}

function encodeXmlText(value) {
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}

function isEditableWordPart(path) {
  return /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/u.test(path);
}

/**
 * Returns the existing Word text runs in document order. Editing is deliberately
 * limited to individual w:t nodes so run properties, paragraph/table structure,
 * relationships, media and every other OOXML part remain untouched.
 */
export function extractTemplateTextRuns(parts) {
  const result = [];
  for (const [path, bytes] of Object.entries(parts || {})) {
    if (!isEditableWordPart(path)) continue;
    const xml = decoder.decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    let index = 0;
    let paragraphIndex = 0;
    for (const paragraph of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/gu)) {
      const nodes = [...paragraph[1].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gu)]
        .map((match) => decodeXmlText(match[1]));
      const combined = nodes.join('');
      const protectedRanges = [...combined.matchAll(/\{\{\s*[\p{L}\p{N}_.-]+\s*\}\}/gu)]
        .map((match) => ({ start: match.index, end: match.index + match[0].length }));
      let offset = 0;
      for (const text of nodes) {
        const start = offset;
        const end = start + text.length;
        const editable = !protectedRanges.some((range) => start < range.end && end > range.start);
        result.push({ path, index: index++, paragraphIndex, text, editable });
        offset = end;
      }
      paragraphIndex++;
    }
  }
  return result;
}

/**
 * Applies text-only edits to existing w:t nodes. Each edit must carry the exact
 * original text returned by extractTemplateTextRuns, preventing stale writes.
 */
export function applyTemplateTextEdits(parts, edits) {
  if (!parts || typeof parts !== 'object' || !Array.isArray(edits)) {
    throw new Error('Μη έγκυρα δεδομένα επεξεργασίας προτύπου.');
  }
  const grouped = new Map();
  for (const edit of edits) {
    if (!edit || typeof edit.path !== 'string' || !isEditableWordPart(edit.path) ||
        !Number.isInteger(edit.index) || edit.index < 0 ||
        typeof edit.originalText !== 'string' || typeof edit.text !== 'string') {
      throw new Error('Μη έγκυρη αλλαγή κειμένου προτύπου.');
    }
    if (edit.text.length > 10000) throw new Error('Το κείμενο ενός πεδίου υπερβαίνει το επιτρεπόμενο όριο.');
    if (/\{\{\s*[\p{L}\p{N}_.-]+\s*\}\}/u.test(edit.originalText)) {
      throw new Error('Τα placeholders δεν επιτρέπεται να τροποποιηθούν από τον επεξεργαστή κειμένου.');
    }
    if (!grouped.has(edit.path)) grouped.set(edit.path, new Map());
    const pathEdits = grouped.get(edit.path);
    if (pathEdits.has(edit.index)) throw new Error('Υπάρχουν αλλαγές διπλής καταχώρισης στο ίδιο σημείο.');
    pathEdits.set(edit.index, edit);
  }

  const output = Object.fromEntries(Object.entries(parts).map(([path, bytes]) => [
    path,
    bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes)
  ]));

  for (const [path, pathEdits] of grouped) {
    if (!output[path]) throw new Error('Το τμήμα DOCX προς επεξεργασία δεν βρέθηκε: ' + path);
    const currentRuns = new Map(extractTemplateTextRuns({ [path]: output[path] }).map((run) => [run.index, run]));
    for (const [editIndex, edit] of pathEdits) {
      const currentRun = currentRuns.get(editIndex);
      if (!currentRun || !currentRun.editable) {
        throw new Error('Τα placeholders δεν επιτρέπεται να τροποποιηθούν από τον επεξεργαστή κειμένου.');
      }
      if (currentRun.text !== edit.originalText) {
        throw new Error('Το πρότυπο άλλαξε από τότε που άνοιξες τον επεξεργαστή. Κλείσε τον και άνοιξέ τον ξανά.');
      }
    }
    const xml = decoder.decode(output[path]);
    let index = 0;
    let applied = 0;
    const updated = xml.replace(/(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/gu, (whole, open, rawText, close) => {
      const edit = pathEdits.get(index++);
      if (!edit) return whole;
      const current = decodeXmlText(rawText);
      if (current !== edit.originalText) throw new Error('Το πρότυπο άλλαξε από τότε που άνοιξες τον επεξεργαστή. Κλείσε τον και άνοιξέ τον ξανά.');
      if (edit.text === current) { applied++; return whole; }
      let safeOpen = open;
      if (/^\s|\s$/u.test(edit.text) && !/\bxml:space\s*=\s*["']preserve["']/u.test(safeOpen)) {
        safeOpen = safeOpen.replace(/>$/u, ' xml:space="preserve">');
      }
      applied++;
      return safeOpen + encodeXmlText(edit.text) + close;
    });
    for (const editIndex of pathEdits.keys()) {
      if (editIndex >= index) throw new Error('Το σημείο κειμένου δεν υπάρχει πλέον στο πρότυπο.');
    }
    if (applied !== pathEdits.size) throw new Error('Δεν εφαρμόστηκαν όλες οι αλλαγές κειμένου.');
    output[path] = encoder.encode(updated);
  }
  return output;
}
