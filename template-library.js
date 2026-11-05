import { unzipSync, zipSync } from './vendor/fflate.js';
import { DEFAULT_NARCOTICS_TEMPLATES, DEFAULT_COUNTERFEIT_TEMPLATES } from './dossier-templates-data.js';

const KEY = 'axyp-docx-templates';
const NARCOTICS_SEED_KEY = 'axyp-narcotics-templates-seeded-v1';
const COUNTERFEIT_SEED_KEY = 'axyp-counterfeit-templates-seeded-v1';
const $ = (id) => document.getElementById(id);
const storage = () => window.AXYP_STORAGE || localStorage;
const read = () => { try { return JSON.parse(storage().getItem(KEY) || '[]'); } catch (_) { return []; } };
const write = (value) => storage().setItem(KEY, JSON.stringify(value));
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]);

export function ensureDefaultTemplates(storageInstance = storage()) {
  try {
    const existing = (() => {
      try { return JSON.parse(storageInstance.getItem(KEY) || '[]'); } catch (_) { return []; }
    })();

    const existingNames = new Set(existing.map((t) => t.name));
    let updated = [...existing];
    let hasChanges = false;

    // 1. Narcotics templates seeding
    if (!storageInstance.getItem(NARCOTICS_SEED_KEY)) {
      const toAddNarcotics = (DEFAULT_NARCOTICS_TEMPLATES || []).filter((t) => !existingNames.has(t.name));
      if (toAddNarcotics.length > 0) {
        updated = [...updated, ...toAddNarcotics];
        toAddNarcotics.forEach((t) => existingNames.add(t.name));
        hasChanges = true;
      }
      storageInstance.setItem(NARCOTICS_SEED_KEY, 'true');
    }

    // 2. Counterfeit templates seeding. Add the category-specific serial-number
    // field to the three source documents where the same value is repeated.
    if (!storageInstance.getItem(COUNTERFEIT_SEED_KEY)) {
      const toAddCounterfeit = (DEFAULT_COUNTERFEIT_TEMPLATES || [])
        .filter((t) => !existingNames.has(t.name))
        .map(prepareCounterfeitTemplate);
      if (toAddCounterfeit.length > 0) {
        updated = [...updated, ...toAddCounterfeit];
        toAddCounterfeit.forEach((t) => existingNames.add(t.name));
        hasChanges = true;
      }
      storageInstance.setItem(COUNTERFEIT_SEED_KEY, 'true');
    }

    if (hasChanges) {
      storageInstance.setItem(KEY, JSON.stringify(updated));
    }
  } catch (e) {
    console.error('Failed to seed default templates:', e);
  }
}

export async function initializeDefaultTemplates(storageInstance = storage()) {
  // Το storage.js ολοκληρώνει πρώτα την ανάγνωση/μεταφορά από IndexedDB.
  // Έτσι το seed δεν μπορεί να πατήσει πάνω σε νεότερα αποθηκευμένα δεδομένα.
  if (storageInstance && storageInstance.ready && typeof storageInstance.ready.then === 'function') {
    await storageInstance.ready;
  }
  ensureDefaultTemplates(storageInstance);
}

function uint8ToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }
  throw new Error('No base64 encoding function available');
}

function prepareCounterfeitTemplate(template) {
  const targetIds = new Set(['counterfeit-01', 'counterfeit-02', 'counterfeit-03']);
  if (!targetIds.has(template.id)) return template;
  const parts = getTemplateParts(template);
  const documentPath = 'word/document.xml';
  if (!parts[documentPath]) throw new Error('Missing main DOCX document for ' + template.id);
  let xml = normalizeDocxXml(new TextDecoder().decode(parts[documentPath]));
  if (!xml.includes('{{counterfeit.serialNumber}}')) {
    const evidenceParagraph = xml.match(/<w:p\b[^>]*>[\s\S]*?\{\{\s*evidence\.quantity\s*\}\}[\s\S]*?<\/w:p>/);
    if (!evidenceParagraph) throw new Error('Could not locate evidence quantity paragraph in ' + template.id);
    const serialParagraph = '<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t xml:space="preserve">Σειριακός αριθμός πλαστού χαρτονομίσματος: {{counterfeit.serialNumber}}</w:t></w:r></w:p>';
    xml = xml.replace(evidenceParagraph[0], evidenceParagraph[0] + serialParagraph);
  }
  parts[documentPath] = new TextEncoder().encode(xml);
  const bytes = zipSync(parts);
  return {
    ...template,
    dataBase64: uint8ToBase64(bytes),
    size: bytes.length,
    fields: [...new Set([...(template.fields || []), 'counterfeit.serialNumber'])],
    mappings: { ...(template.mappings || {}), 'counterfeit.serialNumber': 'counterfeit.serialNumber' }
  };
}

export function base64ToUint8(base64) {
  if (typeof atob === 'function') {
    const bin = atob(base64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  throw new Error('No base64 decoding function available');
}

export function getTemplateParts(template) {
  if (template.files) {
    return Object.fromEntries(Object.entries(template.files).map(([name, data]) => [name, new Uint8Array(data)]));
  }
  if (template.dataBase64) {
    return unzipSync(base64ToUint8(template.dataBase64));
  }
  return {};
}

const getCase = () => {
  try {
    const all = JSON.parse(storage().getItem('axyp-hypotheses') || '[]');
    const activeId = $('case-id')?.value || (window.HypothesesView && window.HypothesesView.getSelectedId && window.HypothesesView.getSelectedId());
    if (!activeId) return null;
    return all.find((item) => item.id === activeId) || null;
  } catch (_) {
    return {};
  }
};

const normalizeDocxXml = (xml) => {
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (p) => {
    return p.replace(/\{\{(?:(?!\{\{|\}\})[\s\S])*?\}\}/g, (match) => {
      if (!match.includes('<')) return match;
      const plain = match.replace(/<[^>]+>/g, '');
      const field = plain.match(/^\s*\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}\s*$/);
      if (field) {
        return `</w:t></w:r><w:r><w:t xml:space="preserve">{{${field[1]}}}</w:t></w:r><w:r><w:t xml:space="preserve">`;
      }
      return match;
    });
  });
};

const extractFields = (xml) => [...new Set((normalizeDocxXml(xml).match(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g) || []).map((val) => val.replace(/\{\{|\}\}|\s/g, '')))];
const display = (value) => value || '—';

export function addMinutes(timeStr, mins) {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return '';
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return '';
  const totalMins = (h * 60 + m + mins) % (24 * 60);
  const normalized = totalMins < 0 ? totalMins + 24 * 60 : totalMins;
  const newH = Math.floor(normalized / 60);
  const newM = normalized % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

export function computeTimeline(baseTime) {
  if (!baseTime) return {};
  const witnessStart = baseTime;
  const witnessEnd = addMinutes(witnessStart, 5);
  const arrestStart = addMinutes(witnessEnd, 1);
  const arrestEnd = addMinutes(arrestStart, 5);
  const seizureStart = addMinutes(arrestEnd, 1);
  const seizureEnd = addMinutes(seizureStart, 5);
  const notificationStart = addMinutes(seizureEnd, 1);
  const notificationEnd = addMinutes(notificationStart, 5);
  const weighingStart = addMinutes(notificationEnd, 1);
  const weighingEnd = addMinutes(weighingStart, 5);
  const examinationStart = addMinutes(weighingEnd, 1);
  const examinationEnd = addMinutes(examinationStart, 5);

  return {
    witnessStartTime: witnessStart,
    witnessEndTime: witnessEnd,
    arrestStartTime: arrestStart,
    arrestEndTime: arrestEnd,
    seizureStartTime: seizureStart,
    seizureEndTime: seizureEnd,
    notificationStartTime: notificationStart,
    notificationEndTime: notificationEnd,
    weighingStartTime: weighingStart,
    weighingEndTime: weighingEnd,
    examinationStartTime: examinationStart,
    examinationEndTime: examinationEnd
  };
}

const FIELD_OPTIONS = [
  { path: 'case.title', label: 'Υπόθεση · Τίτλος' },
  { path: 'case.protocolNumber', label: 'Υπόθεση · Αριθμός Πρωτοκόλλου' },
  { path: 'case.offence', label: 'Υπόθεση · Είδος αδικήματος' },
  { path: 'case.status', label: 'Υπόθεση · Κατάσταση' },
  { path: 'case.date', label: 'Υπόθεση · Ημερομηνία' },
  { path: 'case.time', label: 'Υπόθεση · Ώρα σύνταξης' },
  { path: 'case.location', label: 'Υπόθεση · Τόπος / Πόλη σύνταξης' },
  { path: 'case.prosecutor', label: 'Υπόθεση · Εισαγγελία Πρωτοδικών' },
  { path: 'case.profile', label: 'Υπόθεση · Νομικό προφίλ' },
  { path: 'case.people', label: 'Υπόθεση · Εμπλεκόμενοι / Δράστες' },
  { path: 'case.evidence', label: 'Υπόθεση · Ευρήματα / Ποσότητες' },
  { path: 'case.notes', label: 'Υπόθεση · Σημειώσεις' },
  { path: 'case.arrestingOfficer', label: 'Υπόθεση · Συλλαβών (Στοιχεία/Υπηρεσία)' },
  { path: 'officerA.fullName', label: 'Α΄ Ανακριτικός · Βαθμός & Ονοματεπώνυμο' },
  { path: 'officerA.rank', label: 'Α΄ Ανακριτικός · Βαθμός' },
  { path: 'officerA.surname', label: 'Α΄ Ανακριτικός · Επώνυμο' },
  { path: 'officerA.name', label: 'Α΄ Ανακριτικός · Όνομα' },
  { path: 'officerA.service', label: 'Α΄ Ανακριτικός · Υπηρεσία' },
  { path: 'officerB.fullName', label: 'Β΄ Ανακριτικός · Βαθμός & Ονοματεπώνυμο' },
  { path: 'officerB.rank', label: 'Β΄ Ανακριτικός · Βαθμός' },
  { path: 'officerB.surname', label: 'Β΄ Ανακριτικός · Επώνυμο' },
  { path: 'officerB.name', label: 'Β΄ Ανακριτικός · Όνομα' },
  { path: 'officerB.service', label: 'Β΄ Ανακριτικός · Υπηρεσία' },
  { path: 'person.fullName', label: 'Πρόσωπο · Ονοματεπώνυμο' },
  { path: 'person.surname', label: 'Πρόσωπο · Επώνυμο' },
  { path: 'person.name', label: 'Πρόσωπο · Όνομα' },
  { path: 'person.fatherName', label: 'Πρόσωπο · Πατρώνυμο' },
  { path: 'person.motherName', label: 'Πρόσωπο · Μητρώνυμο' },
  { path: 'person.birthDate', label: 'Πρόσωπο · Ημερομηνία γέννησης' },
  { path: 'person.birthPlace', label: 'Πρόσωπο · Τόπος γέννησης' },
  { path: 'person.city', label: 'Πρόσωπο · Πόλη κατοικίας' },
  { path: 'person.address', label: 'Πρόσωπο · Διεύθυνση κατοικίας' },
  { path: 'person.idNumber', label: 'Πρόσωπο · Αριθμός ταυτότητας' },
  { path: 'person.idDate', label: 'Πρόσωπο · Ημερομηνία έκδοσης ταυτότητας' },
  { path: 'person.idService', label: 'Πρόσωπο · Υπηρεσία έκδοσης' },
  { path: 'person.taxId', label: 'Πρόσωπο · Α.Φ.Μ.' },
  { path: 'person.phone', label: 'Πρόσωπο · Τηλέφωνο' },
  { path: 'person.email', label: 'Πρόσωπο · Email' },
  { path: 'counterfeit.witness.fullName', label: 'Πλαστά · Μάρτυρας · Ονοματεπώνυμο' },
  { path: 'counterfeit.witness.surname', label: 'Πλαστά · Μάρτυρας · Επώνυμο' },
  { path: 'counterfeit.witness.name', label: 'Πλαστά · Μάρτυρας · Όνομα' },
  { path: 'counterfeit.witness.fatherName', label: 'Πλαστά · Μάρτυρας · Πατρώνυμο' },
  { path: 'counterfeit.witness.motherName', label: 'Πλαστά · Μάρτυρας · Μητρώνυμο' },
  { path: 'counterfeit.witness.birthDate', label: 'Πλαστά · Μάρτυρας · Ημερομηνία γέννησης' },
  { path: 'counterfeit.witness.birthPlace', label: 'Πλαστά · Μάρτυρας · Τόπος γέννησης' },
  { path: 'counterfeit.witness.city', label: 'Πλαστά · Μάρτυρας · Πόλη κατοικίας' },
  { path: 'counterfeit.witness.address', label: 'Πλαστά · Μάρτυρας · Διεύθυνση' },
  { path: 'counterfeit.witness.idNumber', label: 'Πλαστά · Μάρτυρας · Αριθμός ταυτότητας' },
  { path: 'counterfeit.witness.idDate', label: 'Πλαστά · Μάρτυρας · Ημερομηνία έκδοσης ταυτότητας' },
  { path: 'counterfeit.witness.idService', label: 'Πλαστά · Μάρτυρας · Υπηρεσία έκδοσης' },
  { path: 'counterfeit.witness.email', label: 'Πλαστά · Μάρτυρας · Email' },
  { path: 'counterfeit.depositor.fullName', label: 'Πλαστά · Καταθέτης στο ΑΤΜ · Ονοματεπώνυμο' },
  { path: 'counterfeit.depositor.surname', label: 'Πλαστά · Καταθέτης στο ΑΤΜ · Επώνυμο' },
  { path: 'counterfeit.depositor.name', label: 'Πλαστά · Καταθέτης στο ΑΤΜ · Όνομα' },
  { path: 'counterfeit.depositor.fatherName', label: 'Πλαστά · Καταθέτης στο ΑΤΜ · Πατρώνυμο' },
  { path: 'counterfeit.depositor.motherName', label: 'Πλαστά · Καταθέτης στο ΑΤΜ · Μητρώνυμο' },
  { path: 'counterfeit.depositor.birthDate', label: 'Πλαστά · Καταθέτης στο ΑΤΜ · Ημερομηνία γέννησης' },
  { path: 'counterfeit.depositor.birthPlace', label: 'Πλαστά · Καταθέτης στο ΑΤΜ · Τόπος γέννησης' },
  { path: 'counterfeit.depositor.city', label: 'Πλαστά · Καταθέτης στο ΑΤΜ · Πόλη κατοικίας' },
  { path: 'counterfeit.depositor.address', label: 'Πλαστά · Καταθέτης στο ΑΤΜ · Διεύθυνση' },
  { path: 'counterfeit.depositor.idNumber', label: 'Πλαστά · Καταθέτης στο ΑΤΜ · Αριθμός ταυτότητας' },
  { path: 'counterfeit.depositor.idDate', label: 'Πλαστά · Καταθέτης στο ΑΤΜ · Ημερομηνία έκδοσης ταυτότητας' },
  { path: 'counterfeit.depositor.idService', label: 'Πλαστά · Καταθέτης στο ΑΤΜ · Υπηρεσία έκδοσης' },
  { path: 'counterfeit.depositor.taxId', label: 'Πλαστά · Καταθέτης στο ΑΤΜ · Α.Φ.Μ.' },
  { path: 'counterfeit.depositor.phone', label: 'Πλαστά · Καταθέτης στο ΑΤΜ · Τηλέφωνο' },
  { path: 'counterfeit.depositor.email', label: 'Πλαστά · Καταθέτης στο ΑΤΜ · Email' },
  { path: 'evidence.quantity', label: 'Ευρήματα · Ποσότητες' },
  { path: 'counterfeit.serialNumber', label: 'Πλαστό νόμισμα · Σειριακός αριθμός' },
  { path: 'timeline.witness.startTime', label: '1. Κατάθεση · Ώρα έναρξης' },
  { path: 'timeline.witness.endTime', label: "1. Κατάθεση · Ώρα περάτωσης (+5')" },
  { path: 'timeline.arrest.startTime', label: "2. Έκθεση σύλληψης · Ώρα έναρξης (+1')" },
  { path: 'timeline.arrest.endTime', label: "2. Έκθεση σύλληψης · Ώρα περάτωσης (+5')" },
  { path: 'timeline.seizure.startTime', label: "3. Έκθεση κατάσχεσης · Ώρα έναρξης (+1')" },
  { path: 'timeline.seizure.endTime', label: "3. Έκθεση κατάσχεσης · Ώρα περάτωσης (+5')" },
  { path: 'timeline.notification.startTime', label: "4. Έκθεση γνωστοποίησης · Ώρα έναρξης (+1')" },
  { path: 'timeline.notification.endTime', label: "4. Έκθεση γνωστοποίησης · Ώρα περάτωσης (+5')" },
  { path: 'timeline.weighing.startTime', label: "5. Έκθεση ζύγισης · Ώρα έναρξης (+1')" },
  { path: 'timeline.weighing.endTime', label: "5. Έκθεση ζύγισης · Ώρα περάτωσης (+5')" },
  { path: 'timeline.examination.startTime', label: "6. Έκθεση απολογίας · Ώρα έναρξης (+1')" },
  { path: 'timeline.examination.endTime', label: "6. Έκθεση απολογίας · Ώρα περάτωσης (+5')" }
];

function mappingFor(template, field) {
  if (template.mappings && template.mappings[field]) return template.mappings[field];
  if (FIELD_OPTIONS.some((option) => option.path === field)) return field;
  if (field.startsWith('offender.')) {
    const candidate = field.replace('offender.', 'person.');
    if (FIELD_OPTIONS.some((o) => o.path === candidate)) return candidate;
  }
  return '';
}

export function valueFor(path, item) {
  if (!item) return '—';
  const offender = item.offender || {};
  const counterfeit = item.counterfeit || {};
  const witness = counterfeit.witness || {};
  const depositor = counterfeit.depositor || {};
  const witnessFullName = [witness.surname, witness.name].filter(Boolean).join(' ');
  const depositorFullName = [depositor.surname, depositor.name].filter(Boolean).join(' ');
  const officerA = item.officerA || {};
  const officerB = item.officerB || {};
  const officerAFull = [officerA.rank, officerA.surname, officerA.name].filter(Boolean).join(' ');
  const officerBFull = [officerB.rank, officerB.surname, officerB.name].filter(Boolean).join(' ');
  const timeline = item.timeline || {};
  const computed = item.profile === 'narcotics' ? computeTimeline(item.time || '') : {};
  const getTime = (key) => timeline[key] || computed[key] || item[key] || '';
  const map = {
    'case.title': item.title,
    'case.protocolNumber': item.protocolNumber,
    'case.offence': item.offence,
    'case.status': item.status,
    'case.date': item.date,
    'case.time': item.time,
    'case.location': item.location,
    'case.prosecutor': item.prosecutor,
    'case.notes': item.notes,
    'case.profile': item.profile,
    'case.people': item.people,
    'case.evidence': item.evidence,
    'case.arrestingOfficer': item.arrestingOfficer,
    'officerA.fullName': officerAFull,
    'officerA.rank': officerA.rank,
    'officerA.surname': officerA.surname,
    'officerA.name': officerA.name,
    'officerA.service': officerA.service,
    'officerB.fullName': officerBFull,
    'officerB.rank': officerB.rank,
    'officerB.surname': officerB.surname,
    'officerB.name': officerB.name,
    'officerB.service': officerB.service,
    'evidence.quantity': item.evidence,
    'counterfeit.serialNumber': item.counterfeit && item.counterfeit.serialNumber,
    'timeline.witness.startTime': getTime('witnessStartTime'),
    'timeline.witness.endTime': getTime('witnessEndTime'),
    'timeline.arrest.startTime': getTime('arrestStartTime'),
    'timeline.arrest.endTime': getTime('arrestEndTime'),
    'timeline.seizure.startTime': getTime('seizureStartTime'),
    'timeline.seizure.endTime': getTime('seizureEndTime'),
    'timeline.notification.startTime': getTime('notificationStartTime'),
    'timeline.notification.endTime': getTime('notificationEndTime'),
    'timeline.weighing.startTime': getTime('weighingStartTime'),
    'timeline.weighing.endTime': getTime('weighingEndTime'),
    'timeline.examination.startTime': getTime('examinationStartTime'),
    'timeline.examination.endTime': getTime('examinationEndTime'),
    'case.witnessStartTime': getTime('witnessStartTime'),
    'case.witnessEndTime': getTime('witnessEndTime'),
    'case.arrestStartTime': getTime('arrestStartTime'),
    'case.arrestEndTime': getTime('arrestEndTime'),
    'case.seizureStartTime': getTime('seizureStartTime'),
    'case.seizureEndTime': getTime('seizureEndTime'),
    'case.notificationStartTime': getTime('notificationStartTime'),
    'case.notificationEndTime': getTime('notificationEndTime'),
    'case.weighingStartTime': getTime('weighingStartTime'),
    'case.weighingEndTime': getTime('weighingEndTime'),
    'case.examinationStartTime': getTime('examinationStartTime'),
    'case.examinationEndTime': getTime('examinationEndTime'),
    'person.fullName': [offender.surname, offender.name].filter(Boolean).join(' ') || item.people,
    'person.surname': offender.surname,
    'person.name': offender.name,
    'person.fatherName': offender.fatherName,
    'person.motherName': offender.motherName,
    'person.birthDate': offender.birthDate,
    'person.birthPlace': offender.birthPlace,
    'person.city': offender.city,
    'person.address': offender.address,
    'person.idNumber': offender.idNumber,
    'person.idDate': offender.idDate,
    'person.idService': offender.idService,
    'person.taxId': offender.taxId,
    'person.phone': offender.phone,
    'person.email': offender.email,
    'offender.surname': offender.surname,
    'offender.name': offender.name,
    'offender.fatherName': offender.fatherName,
    'offender.motherName': offender.motherName,
    'offender.birthDate': offender.birthDate,
    'offender.birthPlace': offender.birthPlace,
    'offender.city': offender.city,
    'offender.address': offender.address,
    'offender.idNumber': offender.idNumber,
    'offender.idDate': offender.idDate,
    'offender.idService': offender.idService,
    'offender.taxId': offender.taxId,
    'offender.phone': offender.phone,
    'offender.email': offender.email
  };
  return display(map[path]);
}

export function replaceInXml(xml, template, item) {
  return xml.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, path) => {
    const mapped = mappingFor(template, path);
    const raw = mapped ? valueFor(mapped, item) : `{{${path}}}`;
    if (!raw || raw === '—') return '—';
    const lines = String(raw).split(/\r?\n/);
    return lines.map((line) => esc(line)).join('</w:t><w:br/><w:t xml:space="preserve">');
  });
}

function render() {
  const root = $('template-library');
  if (!root) return;
  root.textContent = '';
  const currentCase = getCase();
  const allTemplates = read();

  const isCounterfeit = (t) => t.category === 'counterfeit';
  const isNarcotics = (t) => !isCounterfeit(t) && (t.category === 'narcotics' || (!t.category && (t.name.startsWith('0') || t.name.startsWith('10_'))));
  const isCustom = (t) => !isCounterfeit(t) && !isNarcotics(t);

  const groups = [
    { title: (count) => `Δικογραφία Ναρκωτικών (${count} πρότυπα)`, items: allTemplates.filter(isNarcotics) },
    { title: (count) => `Δικογραφία Πλαστών Νομισμάτων (${count} πρότυπα)`, items: allTemplates.filter(isCounterfeit) },
    { title: (count) => `Πρόσθετα / προσαρμοσμένα πρότυπα (${count})`, items: allTemplates.filter(isCustom) }
  ];

  groups.forEach((group) => {
    if (!group.items.length) return;
    const heading = document.createElement('h3');
    heading.className = 'template-category-heading';
    heading.textContent = group.title(group.items.length);
    root.appendChild(heading);

    group.items.forEach((template) => {
      const card = document.createElement('article');
      card.className = 'template-file-card template-review-card';
      card.innerHTML =
        '<div class="template-review-head"><div><strong></strong><span class="mapping-status" style="margin-left:8px; font-size:0.8rem;"></span><p class="muted"></p></div><button type="button" class="text-button remove">Διαγραφή</button></div>' +
        '<div class="mapping-review"></div>' +
        '<div class="template-review-actions"><span class="mapping-result muted"></span><button type="button" class="mini-button save-mapping">Αποθήκευση αντιστοίχισης</button><button type="button" class="mini-button generate" disabled>Συμπλήρωση Word</button></div>';

      card.querySelector('strong').textContent = template.name;
      const catLabel = template.categoryLabel || (
        isCounterfeit(template) ? 'Δικογραφία Πλαστών' :
        isNarcotics(template) ? 'Δικογραφία Ναρκωτικών' :
        'Προσαρμοσμένο'
      );
      card.querySelector('.mapping-status').textContent = catLabel;
      const caseNote = currentCase && currentCase.title ? ` (ενεργή υπόθεση: «${currentCase.title}»)` : ' (δεν έχει επιλεγεί υπόθεση)';
      card.querySelector('p').textContent = `${template.fields.length} placeholders εντοπίστηκαν${caseNote}.`;

      const mappingRoot = card.querySelector('.mapping-review');
      template.fields.forEach((field) => {
        const row = document.createElement('label');
        row.className = 'mapping-row';
        row.innerHTML = '<code></code><select><option value="">— Δεν έχει αντιστοιχιστεί —</option></select><output></output>';
        row.querySelector('code').textContent = `{{${field}}}`;

        FIELD_OPTIONS.forEach((option) => {
          const item = document.createElement('option');
          item.value = option.path;
          item.textContent = option.label;
          row.querySelector('select').appendChild(item);
        });

        row.querySelector('select').value = mappingFor(template, field);
        row.querySelector('select').onchange = () => {
          row.querySelector('output').textContent = display(valueFor(row.querySelector('select').value, getCase()));
        };
        row.querySelector('select').dispatchEvent(new Event('change'));
        mappingRoot.appendChild(row);
      });

      card.querySelector('.save-mapping').onclick = () => {
        const mappings = {};
        [...mappingRoot.querySelectorAll('.mapping-row')].forEach((row, rowIndex) => {
          mappings[template.fields[rowIndex]] = row.querySelector('select').value;
        });
        const all = read();
        const targetIdx = all.findIndex((t) => (template.id ? t.id === template.id : t.name === template.name));
        if (targetIdx >= 0) {
          all[targetIdx].mappings = mappings;
          all[targetIdx].mappingConfirmedAt = new Date().toISOString();
          write(all);
        }
        card.querySelector('.mapping-result').textContent = 'Η αντιστοίχιση επιβεβαιώθηκε.';
        card.querySelector('.generate').disabled = false;
      };

      card.querySelector('.generate').onclick = () => {
        const all = read();
        const current = all.find((t) => (template.id ? t.id === template.id : t.name === template.name)) || template;
        generate(current);
      };

      card.querySelector('.remove').onclick = () => {
        if (!window.confirm('Να διαγραφεί το πρότυπο Word;')) return;
        const all = read().filter((t) => (template.id ? t.id !== template.id : t.name !== template.name));
        write(all);
        render();
      };

      if (template.mappingConfirmedAt) card.querySelector('.generate').disabled = false;
      root.appendChild(card);
    });
  });

  if (!root.children.length) root.textContent = 'Δεν έχει εισαχθεί ακόμη πραγματικό πρότυπο Word.';
}

function importTemplate(event) {
  const file = event.target.files[0];
  if (!file) return;
  file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    const parts = unzipSync(bytes);

    // Εντοπισμός placeholders σε όλο το έγγραφο, headers και footers
    const allXml = Object.keys(parts)
      .filter((k) => k.startsWith('word/') && k.endsWith('.xml'))
      .map((k) => new TextDecoder().decode(parts[k] || new Uint8Array()))
      .join('\n');

    const detected = extractFields(allXml);
    const documentXml = new TextDecoder().decode(parts['word/document.xml'] || new Uint8Array());
    const templates = read();
    templates.push({
      id: `${Date.now()}`,
      name: file.name,
      fields: detected,
      documentXml,
      files: Object.fromEntries(Object.entries(parts).map(([name, data]) => [name, Array.from(data)]))
    });
    write(templates);
    render();
    event.target.value = '';
  }).catch(() => {
    window.alert('Δεν ήταν δυνατή η ανάγνωση του αρχείου Word.');
  });
}

export async function generate(template) {
  const item = getCase();
  if (!item || !item.id) {
    if (typeof window !== 'undefined' && window.alert) {
      window.alert('Επίλεξε ρητά την υπόθεση που αφορά το έγγραφο πριν από τη συμπλήρωση.');
    }
    return;
  }
  const files = getTemplateParts(template);

  // Αντικατάσταση placeholders σε document.xml, headers και footers
  Object.keys(files).forEach((filename) => {
    if (filename.startsWith('word/') && filename.endsWith('.xml')) {
      const xml = new TextDecoder().decode(files[filename]);
      files[filename] = new TextEncoder().encode(replaceInXml(xml, template, item));
    }
  });

  const blob = new Blob([zipSync(files)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
  const fileName = (item.title ? item.title.replace(/[\\/:*?"<>|]+/g, '-') : 'ypothesi') + '-' + template.name;
  if (window.AXYP_WORKSPACE && window.AXYP_WORKSPACE.isConnected()) {
    try {
      const persisted = await window.AXYP_WORKSPACE.saveCase(item);
      const allCases = JSON.parse(storage().getItem('axyp-hypotheses') || '[]').map((entry) => entry.id === persisted.id ? persisted : entry);
      storage().setItem('axyp-hypotheses', JSON.stringify(allCases));
      await window.AXYP_WORKSPACE.saveDocument(item.id, fileName, blob);
    } catch (error) {
      window.alert('Το έγγραφο θα ληφθεί, αλλά δεν αποθηκεύτηκε στον φάκελο εργασίας: ' + error.message);
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


if (typeof document !== 'undefined') {
  $('template-file')?.addEventListener('change', importTemplate);
  if (typeof window !== 'undefined') {
    window.TemplateLibrary = { refresh: render, ensureDefaultTemplates, initializeDefaultTemplates, generate, getTemplateParts };
  }
  initializeDefaultTemplates()
    .then(() => { render(); if (window.HypothesesView) window.HypothesesView.refresh(); })
    .catch((error) => {
      console.error('Template library initialization failed:', error);
      render();
    });
}
