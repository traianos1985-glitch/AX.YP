import { unzipSync, zipSync } from './vendor/fflate.js';

export const TEMPLATE_DOCUMENT_HISTORY_LIMIT = 5;

function encodeBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  if (typeof btoa === 'function') {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }
  throw new Error('Δεν υποστηρίζεται κωδικοποίηση ιστορικού εντύπων.');
}

function decodeBase64(value) {
  if (typeof atob === 'function') {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'));
  throw new Error('Δεν υποστηρίζεται αποκωδικοποίηση ιστορικού εντύπων.');
}

export function createTemplateDocumentSnapshot(template, options = {}) {
  if (!template || !template.files || typeof template.files !== 'object') {
    throw new Error('Δεν υπάρχει αποθηκευμένο αρχείο DOCX για δημιουργία αντιγράφου ασφαλείας.');
  }
  const parts = Object.fromEntries(Object.entries(template.files).map(([path, bytes]) => {
    if (!Array.isArray(bytes) && !(bytes instanceof Uint8Array)) {
      throw new Error('Μη έγκυρο περιεχόμενο DOCX στο αρχείο ' + path);
    }
    return [path, new Uint8Array(bytes)];
  }));
  if (!parts['word/document.xml']) throw new Error('Λείπει το κύριο σώμα του εντύπου Word.');
  return {
    savedAt: options.savedAt || new Date().toISOString(),
    label: String(options.label || 'Αυτόματο αντίγραφο πριν από αλλαγή'),
    archiveBase64: encodeBase64(zipSync(parts))
  };
}

export function appendTemplateDocumentSnapshot(history, snapshot, limit = TEMPLATE_DOCUMENT_HISTORY_LIMIT) {
  const entries = Array.isArray(history) ? history.slice() : [];
  if (!snapshot || typeof snapshot.archiveBase64 !== 'string' || !snapshot.archiveBase64) {
    throw new Error('Το αντίγραφο ασφαλείας του εντύπου δεν είναι έγκυρο.');
  }
  const max = Math.max(1, Math.min(20, Number(limit) || TEMPLATE_DOCUMENT_HISTORY_LIMIT));
  return [...entries, snapshot].slice(-max);
}

export function restoreTemplateDocumentSnapshot(snapshot) {
  if (!snapshot || typeof snapshot.archiveBase64 !== 'string' || !snapshot.archiveBase64) {
    throw new Error('Η επιλεγμένη έκδοση εντύπου δεν περιέχει αντίγραφο DOCX.');
  }
  const parts = unzipSync(decodeBase64(snapshot.archiveBase64));
  if (!parts['word/document.xml']) throw new Error('Η αποθηκευμένη έκδοση δεν είναι έγκυρο έγγραφο Word.');
  return Object.fromEntries(Object.entries(parts).map(([path, bytes]) => [path, Array.from(bytes)]));
}

export function extractTemplateFieldsFromParts(parts) {
  const xml = Object.entries(parts || {})
    .filter(([path]) => path.startsWith('word/') && path.endsWith('.xml'))
    .map(([, bytes]) => new TextDecoder().decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)))
    .join('\n');
  return [...new Set((xml.match(/\\{\\{\\s*([\\p{L}\\p{N}_.-]+)\\s*\\}\\}/gu) || [])
    .map((placeholder) => placeholder.replace(/^\\{\\{|\\}\\}$/gu, '').trim()))];
}
