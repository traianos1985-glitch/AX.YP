import { unzipSync, zipSync } from './vendor/fflate.js';
import { detectDocxPersonalData, anonymizeDocxParts, createManualAnonymizationCandidates } from './docx-anonymization.js';

let DEFAULT_NARCOTICS_TEMPLATES = [];
let DEFAULT_COUNTERFEIT_TEMPLATES = [];
let DEFAULT_ENVIRONMENT_TEMPLATES = [];
let DEFAULT_HEALTH_TEMPLATES = [];
let DEFAULT_NOISE_TEMPLATES = [];
let DEFAULT_CAMPING_TEMPLATES = [];
let DEFAULT_COMMERCE_TEMPLATES = [];

const CATEGORY_LOADERS = {
  narcotics: () => import('./template-data/narcotics.js'),
  counterfeit: () => import('./template-data/counterfeit.js'),
  environment: () => import('./template-data/environment.js'),
  health: () => import('./template-data/health.js'),
  noise: () => import('./noise-templates-data.js'),
  camping: () => import('./camping-templates-data.js'),
  commerce: () => import('./paremporio-templates.js')
};
let PUBLISHED_DOSSIER_TEMPLATES = [];
let publishedPackagesPromise = null;

const CATEGORY_SEED_KEYS = {
  narcotics: 'axyp-narcotics-templates-seeded-v1',
  counterfeit: 'axyp-counterfeit-templates-seeded-v1',
  environment: 'axyp-environment-templates-seeded-v1',
  health: 'axyp-health-templates-seeded-v1',
  noise: 'axyp-noise-templates-seeded-v1',
  camping: 'axyp-camping-templates-seeded-v1',
  commerce: 'axyp-commerce-templates-seeded-v1'
};
const loadedCategoryPromises = new Map();
const expandedCategories = new Set();

export function loadBuiltinTemplateData(category) {
  const categories = category ? [category] : Object.keys(CATEGORY_LOADERS);
  return Promise.all(categories.map((name) => {
    if (!CATEGORY_LOADERS[name]) throw new Error('Unknown built-in template category: ' + name);
    if (!loadedCategoryPromises.has(name)) {
      const promise = CATEGORY_LOADERS[name]().then((module) => {
        const values = {
          narcotics: module.DEFAULT_NARCOTICS_TEMPLATES,
          counterfeit: module.DEFAULT_COUNTERFEIT_TEMPLATES,
          environment: module.DEFAULT_ENVIRONMENT_TEMPLATES,
          health: module.DEFAULT_HEALTH_TEMPLATES,
          noise: module.DEFAULT_NOISE_TEMPLATES,
          camping: module.DEFAULT_CAMPING_TEMPLATES,
          commerce: module.DEFAULT_COMMERCE_TEMPLATES
        };
        const target = {
          narcotics: (value) => { DEFAULT_NARCOTICS_TEMPLATES = value; },
          counterfeit: (value) => { DEFAULT_COUNTERFEIT_TEMPLATES = value; },
          environment: (value) => { DEFAULT_ENVIRONMENT_TEMPLATES = value; },
          health: (value) => { DEFAULT_HEALTH_TEMPLATES = value; },
          noise: (value) => { DEFAULT_NOISE_TEMPLATES = value; },
          camping: (value) => { DEFAULT_CAMPING_TEMPLATES = value; },
          commerce: (value) => { DEFAULT_COMMERCE_TEMPLATES = value; }
        };
        target[name](values[name] || []);
        return true;
      }).catch((error) => {
        loadedCategoryPromises.delete(name);
        throw error;
      });
      loadedCategoryPromises.set(name, promise);
    }
    return loadedCategoryPromises.get(name);
  })).then(() => true);
}

const KEY = 'axyp-docx-templates';
const $ = (id) => document.getElementById(id);
const storage = () => window.AXYP_STORAGE || localStorage;
const read = () => { try { return JSON.parse(storage().getItem(KEY) || '[]'); } catch (_) { return []; } };

export async function loadPublishedDossierPackages() {
  if (publishedPackagesPromise) return publishedPackagesPromise;
  publishedPackagesPromise = (async () => {
    const response = await fetch(new URL('./dossier-packages/manifest.json', import.meta.url));
    if (!response.ok) throw new Error('Published dossier package catalog is unavailable: HTTP ' + response.status);
    const catalog = await response.json();
    if (!catalog || catalog.schemaVersion !== 1 || !Array.isArray(catalog.packages)) {
      throw new Error('Invalid published dossier package catalog.');
    }
    const loaded = [];
    for (const entry of catalog.packages) {
      if (!entry || typeof entry.file !== 'string' || !/^[\\p{L}\\p{N}._-]+\\.axyp\\.zip$/u.test(entry.file)) {
        throw new Error('Invalid dossier package filename in catalog.');
      }
      const packageResponse = await fetch(new URL('./dossier-packages/' + entry.file, import.meta.url));
      if (!packageResponse.ok) throw new Error('Could not load dossier package: ' + entry.file);
      const packageParts = unzipSync(new Uint8Array(await packageResponse.arrayBuffer()));
      if (!packageParts['manifest.json']) throw new Error('Dossier package manifest is missing: ' + entry.file);
      const manifest = JSON.parse(new TextDecoder().decode(packageParts['manifest.json']));
      if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.documents) || typeof manifest.category !== 'string') {
        throw new Error('Invalid dossier package: ' + entry.file);
      }
      for (const document of manifest.documents) {
        if (!document || typeof document.path !== 'string' || !document.path.startsWith('documents/') || !packageParts[document.path]) {
          throw new Error('Invalid document entry in dossier package: ' + entry.file);
        }
        const parts = unzipSync(packageParts[document.path]);
        if (!parts['word/document.xml']) throw new Error('Published DOCX is missing its main document: ' + document.name);
        loaded.push({
          id: String(document.id || entry.id + '-' + loaded.length),
          name: String(document.name || 'Έντυπο Word'),
          category: manifest.category,
          categoryLabel: 'Επίσημο πακέτο εφαρμογής',
          source: 'published-package',
          fidelityMode: 'placeholder-only',
          fields: Array.isArray(document.fields) ? document.fields : [],
          mappings: document.mappings && typeof document.mappings === 'object' ? document.mappings : {},
          mappingConfirmedAt: manifest.publishedAt || manifest.createdAt || 'published',
          files: Object.fromEntries(Object.entries(parts).map(([name, bytes]) => [name, Array.from(bytes)]))
        });
      }
    }
    PUBLISHED_DOSSIER_TEMPLATES = loaded;
    return loaded;
  })().catch((error) => {
    publishedPackagesPromise = null;
    throw error;
  });
  return publishedPackagesPromise;
}
const write = (value) => storage().setItem(KEY, JSON.stringify(value));
const unesc = (value) => String(value ?? '')
  .replace(/&apos;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&gt;/g, '>')
  .replace(/&lt;/g, '<')
  .replace(/&amp;/g, '&');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]);

function templatesForCategory(category) {
  return {
    narcotics: DEFAULT_NARCOTICS_TEMPLATES,
    counterfeit: DEFAULT_COUNTERFEIT_TEMPLATES,
    environment: DEFAULT_ENVIRONMENT_TEMPLATES,
    health: DEFAULT_HEALTH_TEMPLATES,
    noise: DEFAULT_NOISE_TEMPLATES,
    camping: DEFAULT_CAMPING_TEMPLATES,
    commerce: DEFAULT_COMMERCE_TEMPLATES
  }[category] || [];
}

async function seedCategory(storageInstance, category) {
  await loadBuiltinTemplateData(category);
  const seedKey = CATEGORY_SEED_KEYS[category];
  if (storageInstance.getItem(seedKey)) return;
  const existing = (() => {
    try { return JSON.parse(storageInstance.getItem(KEY) || '[]'); } catch (_) { return []; }
  })();
  const keyOf = (template) => (template.category ? `${template.category}:${template.name}` : template.name);
  const existingKeys = new Set(existing.map(keyOf));
  const defaults = templatesForCategory(category) || [];
  const additions = defaults
    .filter((template) => !existingKeys.has(keyOf(template)))
    .map((template) => category === 'counterfeit' ? prepareCounterfeitTemplate(template) : template);
  if (additions.length) storageInstance.setItem(KEY, JSON.stringify([...existing, ...additions]));
  storageInstance.setItem(seedKey, 'true');
}

export async function ensureDefaultTemplates(storageInstance = storage(), category) {
  if (storageInstance && storageInstance.ready && typeof storageInstance.ready.then === 'function') {
    await storageInstance.ready;
  }
  const categories = category ? [category] : Object.keys(CATEGORY_LOADERS);
  for (const name of categories) {
    if (!CATEGORY_LOADERS[name]) throw new Error('Unknown built-in template category: ' + name);
    await seedCategory(storageInstance, name);
  }
}

export async function initializeDefaultTemplates(storageInstance = storage()) {
  await loadPublishedDossierPackages();
  // Περιμένουμε μόνο την ενυδάτωση της τοπικής αποθήκευσης.
  // Τα μεγάλα DOCX data chunks φορτώνονται όταν ανοιχτεί η αντίστοιχη κατηγορία.
  if (storageInstance && storageInstance.ready && typeof storageInstance.ready.then === 'function') {
    await storageInstance.ready;
  }
  return true;
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
      const field = plain.match(/^\s*\{\{\s*([\p{L}\p{N}_.-]+)\s*\}\}\s*$/u);
      if (field) {
        return `</w:t></w:r><w:r><w:t xml:space="preserve">{{${field[1]}}}</w:t></w:r><w:r><w:t xml:space="preserve">`;
      }
      return match;
    });
  });
};

const extractFields = (xml) => [...new Set((normalizeDocxXml(xml).match(/\{\{\s*([\p{L}\p{N}_.-]+)\s*\}\}/gu) || []).map((val) => val.replace(/\{\{|\}\}|\s/g, '')))];
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
  { path: 'service.directorate', label: 'Υπηρεσία · Διεύθυνση Αστυνομίας' },
  { path: 'service.name', label: 'Υπηρεσία · Ονομασία' },
  { path: 'service.address', label: 'Υπηρεσία · Διεύθυνση' },
  { path: 'service.phone', label: 'Υπηρεσία · Τηλέφωνο' },
  { path: 'service.email', label: 'Υπηρεσία · Email' },
  { path: 'service.prosecutor', label: 'Υπηρεσία · Αρμόδια Εισαγγελία' },
  { path: 'service.chemicalService', label: 'Υπηρεσία · Αρμόδια Χημική Υπηρεσία' },
  { path: 'case.title', label: 'Υπόθεση · Τίτλος' },
  { path: 'case.protocolNumber', label: 'Υπόθεση · Αριθμός Πρωτοκόλλου' },
  { path: 'case.offence', label: 'Υπόθεση · Είδος αδικήματος' },
  { path: 'case.status', label: 'Υπόθεση · Κατάσταση' },
  { path: 'case.date', label: 'Υπόθεση · Ημερομηνία' },
  { path: 'case.date.day', label: 'Ημερομηνία · Ημέρα' },
  { path: 'case.date.monthName', label: 'Ημερομηνία · Μήνας' },
  { path: 'case.date.year', label: 'Ημερομηνία · Έτος' },
  { path: 'case.date.weekdayName', label: 'Ημερομηνία · Ημέρα εβδομάδας' },
  { path: 'case.releaseDate', label: 'Υπόθεση · Ημερομηνία απόλυσης' },
  { path: 'case.time', label: 'Υπόθεση · Ώρα σύνταξης' },
  { path: 'incident.date', label: 'Συμβάν · Ημερομηνία' },
  { path: 'incident.time', label: 'Συμβάν · Ώρα' },
  { path: 'incident.location', label: 'Συμβάν · Τόπος' },
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
  { path: 'offenderA.fullName', label: 'Δράστης Α · Ονοματεπώνυμο' },
  { path: 'offenderA.idNumber', label: 'Δράστης Α · Αριθμός ταυτότητας' },
  { path: 'offenderA.address', label: 'Δράστης Α · Διεύθυνση' },
  { path: 'offenderB.fullName', label: 'Δράστης Β · Ονοματεπώνυμο' },
  { path: 'offenderB.idNumber', label: 'Δράστης Β · Αριθμός ταυτότητας' },
  { path: 'offenderB.address', label: 'Δράστης Β · Διεύθυνση' },
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
  { path: 'person.taxOffice', label: 'Πρόσωπο · Δ.Ο.Υ.' },
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
  { path: 'environment.description', label: 'Ρύπανση · Περιγραφή πράξης / αποβλήτων' },
  { path: 'health.description', label: 'Υγειονομικός · Περιγραφή παράβασης / εγκατάστασης' },
  { path: 'noise.description', label: 'Ηχορύπανση · Περιγραφή παράβασης' },
  { path: 'noise.establishmentName', label: 'Ηχορύπανση · Κατάστημα' },
  { path: 'noise.measuredDecibels', label: 'Ηχορύπανση · Μετρηθείσα ένταση' },
  { path: 'noise.limitDecibels', label: 'Ηχορύπανση · Επιτρεπόμενο όριο' },
  { path: 'noise.legalProvision', label: 'Ηχορύπανση · Νομική διάταξη' },
  { path: 'noise.regulationNumber', label: 'Ηχορύπανση · Αριθμός απόφασης' },
  { path: 'owner.fullName', label: 'Ιδιοκτήτης · Ονοματεπώνυμο' },
  { path: 'owner.fatherName', label: 'Ιδιοκτήτης · Πατρώνυμο' },
  { path: 'owner.motherName', label: 'Ιδιοκτήτης · Μητρώνυμο' },
  { path: 'owner.birthDate', label: 'Ιδιοκτήτης · Ημερομηνία γέννησης' },
  { path: 'owner.birthPlace', label: 'Ιδιοκτήτης · Τόπος γέννησης' },
  { path: 'owner.city', label: 'Ιδιοκτήτης · Πόλη κατοικίας' },
  { path: 'owner.idNumber', label: 'Ιδιοκτήτης · Αριθμός ταυτότητας' },
  { path: 'owner.idDate', label: 'Ιδιοκτήτης · Ημερομηνία έκδοσης ταυτότητας' },
  { path: 'owner.idService', label: 'Ιδιοκτήτης · Υπηρεσία έκδοσης' },
  { path: 'owner.taxId', label: 'Ιδιοκτήτης · Α.Φ.Μ.' },
  { path: 'owner.taxOffice', label: 'Ιδιοκτήτης · Δ.Ο.Υ.' },
  { path: 'camping.legalProvision', label: 'Camping · Νομική διάταξη' },
  { path: 'camping.location', label: 'Camping · Τόπος' },
  { path: 'camping.actDescription', label: 'Camping · Περιγραφή πράξης' },
  { path: 'camping.actQualifier', label: 'Camping · Χαρακτηρισμός πράξης' },
  { path: 'camping.outdoorItems', label: 'Camping · Αντικείμενα εκτός οχήματος' },
  { path: 'camping.noDesignatedSite', label: 'Camping · Μη καθορισμένος χώρος' },
  { path: 'vehicle.type', label: 'Όχημα · Τύπος' },
  { path: 'vehicle.registration', label: 'Όχημα · Αριθμός κυκλοφορίας' },
  { path: 'vehicle.towVehicleRegistration', label: 'Όχημα · Ρυμουλκό / αυτοκίνητο' },
  { path: 'vehicle.caravanRegistration', label: 'Όχημα · Τροχόσπιτο' },
  { path: 'interpreter.fullName', label: 'Διερμηνέας · Ονοματεπώνυμο' },
  { path: 'interpreter.language', label: 'Διερμηνέας · Γλώσσα' },
  { path: 'interpreter.fatherName', label: 'Διερμηνέας · Πατρώνυμο' },
  { path: 'interpreter.motherName', label: 'Διερμηνέας · Μητρώνυμο' },
  { path: 'interpreter.birthDate', label: 'Διερμηνέας · Ημερομηνία γέννησης' },
  { path: 'interpreter.birthPlace', label: 'Διερμηνέας · Τόπος γέννησης' },
  { path: 'interpreter.city', label: 'Διερμηνέας · Πόλη κατοικίας' },
  { path: 'interpreter.idNumber', label: 'Διερμηνέας · Αριθμός ταυτότητας' },
  { path: 'interpreter.idDate', label: 'Διερμηνέας · Ημερομηνία έκδοσης ταυτότητας' },
  { path: 'interpreter.idService', label: 'Διερμηνέας · Υπηρεσία έκδοσης' },
  { path: 'interpreter.nationality', label: 'Διερμηνέας · Εθνικότητα' },
  { path: 'person.postalCode', label: 'Πρόσωπο · Ταχυδρομικός κώδικας' },
  { path: 'person.nationality', label: 'Πρόσωπο · Εθνικότητα' },
  { path: 'person.spouseFullName', label: 'Πρόσωπο · Ονοματεπώνυμο συζύγου' },
  { path: 'prosecutor.fullName', label: 'Εισαγγελέας · Ονοματεπώνυμο' },
  { path: 'prosecutor.title', label: 'Εισαγγελέας · Ιδιότητα' },
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
  { path: 'timeline.examination.endTime', label: "6. Έκθεση απολογίας · Ώρα περάτωσης (+5')" },
  { path: 'timeline.release.startTime', label: 'Απόλυση · Ώρα' }
];

export function getMissingTemplateFields(template, item) {
  const fields = Array.isArray(template && template.fields) ? template.fields : [];
  return fields.flatMap((field) => {
    const mapped = mappingFor(template, field);
    if (!mapped) return [{ field, reason: 'δεν έχει αντιστοιχιστεί' }];
    const value = valueFor(mapped, item);
    if (value === null || value === undefined || String(value).trim() === '' || String(value).trim() === '—') {
      return [{ field, reason: 'δεν έχει συμπληρωθεί' }];
    }
    return [];
  });
}

function mappingFor(template, field) {
  if (template.mappings && template.mappings[field]) return template.mappings[field];
  if (field === 'officerB.service') return field;
  if (FIELD_OPTIONS.some((option) => option.path === field)) return field;
  if (field.startsWith('offender.')) {
    const candidate = field.replace('offender.', 'person.');
    if (FIELD_OPTIONS.some((o) => o.path === candidate)) return candidate;
  }
  return '';
}

function formatDateToGreekNumeric(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return isoDate;
}

export function valueFor(path, item) {
  if (!item) return '—';
  const offender = item.offender || {};
  const offenderA = item.offenderA || offender;
  const offenderB = item.offenderB || {};
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
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(item.date || ''));
  const dateParts = {};
  if (dateMatch) {
    const date = new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), 12));
    const parts = new Intl.DateTimeFormat('el-GR', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      weekday: 'long'
    }).formatToParts(date);
    for (const type of ['day', 'month', 'year', 'weekday']) {
      const part = parts.find((entry) => entry.type === type);
      dateParts[type] = part ? part.value : '';
    }
  }
  const serviceProfile = typeof window !== 'undefined' && window.AXYP_SERVICE_PROFILE && typeof window.AXYP_SERVICE_PROFILE.get === 'function'
    ? window.AXYP_SERVICE_PROFILE.get()
    : {};
  const map = {
    'service.name': serviceProfile.name,
    'service.directorate': serviceProfile.directorate || '',
    'service.address': serviceProfile.address,
    'service.phone': serviceProfile.phone,
    'service.email': serviceProfile.email,
    'service.prosecutor': serviceProfile.prosecutor,
    'service.chemicalService': serviceProfile.chemicalService,
    'case.title': item.title,
    'case.protocolNumber': item.protocolNumber,
    'case.offence': item.offence,
    'case.status': item.status,
    'case.date': formatDateToGreekNumeric(item.date),
    'case.date.day': dateParts.day,
    'case.date.monthName': dateParts.month,
    'case.date.year': dateParts.year,
    'case.date.weekdayName': dateParts.weekday,
    'case.releaseDate': formatDateToGreekNumeric(item.releaseDate),
    'case.time': item.time,
'incident.date': formatDateToGreekNumeric((item.incident && item.incident.date) || item.incidentDate || item.date),
  'incident.time': (item.incident && item.incident.time) || item.incidentTime || item.time,
  'incident.location': (item.incident && item.incident.location) || '',
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
    'offenderA.fullName': offenderA.fullName || [offenderA.surname, offenderA.name].filter(Boolean).join(' '),
    'offenderA.idNumber': offenderA.idNumber,
    'offenderA.address': offenderA.address,
    'offenderB.fullName': offenderB.fullName || [offenderB.surname, offenderB.name].filter(Boolean).join(' '),
    'offenderB.idNumber': offenderB.idNumber,
    'offenderB.address': offenderB.address,
    'evidence.quantity': item.evidence,
    'counterfeit.serialNumber': item.counterfeit && item.counterfeit.serialNumber,
    'environment.description': (item.environment && item.environment.description) || '.............................',
    'health.description': (item.health && item.health.description) || '.............................',
    'noise.description': (item.noise && item.noise.description) || item.notes,
    'noise.establishmentName': item.noise && item.noise.establishmentName,
    'noise.measuredDecibels': item.noise && item.noise.measuredDecibels,
    'noise.limitDecibels': item.noise && item.noise.limitDecibels,
    'noise.legalProvision': item.noise && item.noise.legalProvision,
    'noise.regulationNumber': item.noise && item.noise.regulationNumber,
    'owner.fullName': item.owner && item.owner.fullName,
    'owner.fatherName': item.owner && item.owner.fatherName,
    'owner.motherName': item.owner && item.owner.motherName,
    'owner.birthDate': formatDateToGreekNumeric(item.owner && item.owner.birthDate),
    'owner.birthPlace': item.owner && item.owner.birthPlace,
    'owner.city': item.owner && item.owner.city,
    'owner.idNumber': item.owner && item.owner.idNumber,
    'owner.idDate': formatDateToGreekNumeric(item.owner && item.owner.idDate),
    'owner.idService': item.owner && item.owner.idService,
    'owner.taxId': item.owner && item.owner.taxId,
    'owner.taxOffice': item.owner && item.owner.taxOffice,
    'camping.legalProvision': item.camping && item.camping.legalProvision,
    'camping.location': item.camping && item.camping.location,
    'camping.actDescription': item.camping && item.camping.actDescription,
    'camping.actQualifier': item.camping && item.camping.actQualifier,
    'camping.outdoorItems': item.camping && item.camping.outdoorItems,
    'camping.noDesignatedSite': item.camping && item.camping.noDesignatedSite,
    'vehicle.type': item.vehicle && item.vehicle.type,
    'vehicle.registration': item.vehicle && item.vehicle.registration,
    'vehicle.towVehicleRegistration': item.vehicle && item.vehicle.towVehicleRegistration,
    'vehicle.caravanRegistration': item.vehicle && item.vehicle.caravanRegistration,
    'interpreter.fullName': item.interpreter && item.interpreter.fullName,
    'interpreter.language': item.interpreter && item.interpreter.language,
    'interpreter.fatherName': item.interpreter && item.interpreter.fatherName,
    'interpreter.motherName': item.interpreter && item.interpreter.motherName,
    'interpreter.birthDate': formatDateToGreekNumeric(item.interpreter && item.interpreter.birthDate),
    'interpreter.birthPlace': item.interpreter && item.interpreter.birthPlace,
    'interpreter.city': item.interpreter && item.interpreter.city,
    'interpreter.idNumber': item.interpreter && item.interpreter.idNumber,
    'interpreter.idDate': formatDateToGreekNumeric(item.interpreter && item.interpreter.idDate),
    'interpreter.idService': item.interpreter && item.interpreter.idService,
    'interpreter.nationality': item.interpreter && item.interpreter.nationality,
    'person.spouseFullName': offender.spouseFullName,
    'prosecutor.fullName': item.prosecutorPerson && item.prosecutorPerson.fullName,
    'prosecutor.title': item.prosecutorPerson && item.prosecutorPerson.title,
    'counterfeit.witness.fullName': witnessFullName,
    'counterfeit.witness.surname': witness.surname,
    'counterfeit.witness.name': witness.name,
    'counterfeit.witness.fatherName': witness.fatherName,
    'counterfeit.witness.motherName': witness.motherName,
    'counterfeit.witness.birthDate': formatDateToGreekNumeric(witness.birthDate),
    'counterfeit.witness.birthPlace': witness.birthPlace,
    'counterfeit.witness.city': witness.city,
    'counterfeit.witness.address': witness.address,
    'counterfeit.witness.idNumber': witness.idNumber,
    'counterfeit.witness.idDate': formatDateToGreekNumeric(witness.idDate),
    'counterfeit.witness.idService': witness.idService,
    'counterfeit.witness.email': witness.email,
    'counterfeit.depositor.fullName': depositorFullName,
    'counterfeit.depositor.surname': depositor.surname,
    'counterfeit.depositor.name': depositor.name,
    'counterfeit.depositor.fatherName': depositor.fatherName,
    'counterfeit.depositor.motherName': depositor.motherName,
    'counterfeit.depositor.birthDate': formatDateToGreekNumeric(depositor.birthDate),
    'counterfeit.depositor.birthPlace': depositor.birthPlace,
    'counterfeit.depositor.city': depositor.city,
    'counterfeit.depositor.address': depositor.address,
    'counterfeit.depositor.idNumber': depositor.idNumber,
    'counterfeit.depositor.idDate': formatDateToGreekNumeric(depositor.idDate),
    'counterfeit.depositor.idService': depositor.idService,
    'counterfeit.depositor.taxId': depositor.taxId,
    'counterfeit.depositor.phone': depositor.phone,
    'counterfeit.depositor.email': depositor.email,
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
    'timeline.release.startTime': getTime('releaseStartTime'),
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
    'person.birthDate': formatDateToGreekNumeric(offender.birthDate),
    'person.birthPlace': offender.birthPlace,
    'person.city': offender.city,
    'person.postalCode': offender.postalCode,
    'person.nationality': offender.nationality,
    'person.address': offender.address,
    'person.idNumber': offender.idNumber,
    'person.idDate': formatDateToGreekNumeric(offender.idDate),
    'person.idService': offender.idService,
    'person.taxId': offender.taxId,
    'person.taxOffice': offender.taxOffice,
    'person.phone': offender.phone,
    'person.email': offender.email,
    'offender.surname': offender.surname,
    'offender.name': offender.name,
    'offender.fatherName': offender.fatherName,
    'offender.motherName': offender.motherName,
    'offender.birthDate': formatDateToGreekNumeric(offender.birthDate),
    'offender.birthPlace': offender.birthPlace,
    'offender.city': offender.city,
    'offender.address': offender.address,
    'offender.idNumber': offender.idNumber,
    'offender.idDate': formatDateToGreekNumeric(offender.idDate),
    'offender.idService': offender.idService,
    'offender.taxId': offender.taxId,
    'offender.phone': offender.phone,
    'offender.email': offender.email
  };
  return display(map[path]);
}

export function replaceInXml(xml, template, item, options = {}) {
  return xml.replace(/\{\{\s*([\p{L}\p{N}_.-]+)\s*\}\}/gu, (placeholder, path) => {
    const mapped = mappingFor(template, path);
    const raw = mapped ? valueFor(mapped, item) : `{{${path}}}`;
    if (!raw || raw === '—') return options.preserveMissing ? placeholder : '—';
    const lines = String(raw).split(/\r?\n/);
    return lines.map((line) => esc(line)).join('</w:t><w:br/><w:t xml:space="preserve">');
  });
}

function render() {
  const root = $('template-library');
  if (!root) return;
  root.textContent = '';
  const currentCase = getCase();
  const allTemplates = [...PUBLISHED_DOSSIER_TEMPLATES, ...read()];

  const isCounterfeit = (t) => t.category === 'counterfeit';
  const isEnvironment = (t) => t.category === 'environment';
  const isHealth = (t) => t.category === 'health';
  const isNoise = (t) => t.category === 'noise';
  const isCamping = (t) => t.category === 'camping';
  const isCommerce = (t) => t.category === 'commerce';
  const isNarcotics = (t) => !isCounterfeit(t) && !isEnvironment(t) && !isHealth(t) && !isNoise(t) && !isCamping(t) && !isCommerce(t) && (t.category === 'narcotics' || (!t.category && !t.files && (t.name.startsWith('0') || t.name.startsWith('10_'))));
  const knownDossierCategories = new Set(['narcotics', 'counterfeit', 'environment', 'health', 'noise', 'camping', 'commerce', 'domestic', 'migration', 'traffic', 'kok', 'animal', 'generic']);
  const isCustom = (t) => !isNarcotics(t) && !knownDossierCategories.has(t.category);

  const groups = [
    { category: 'narcotics', title: (count) => `Δικογραφία Ναρκωτικών (${count} πρότυπα)`, items: allTemplates.filter(isNarcotics) },
    { category: 'counterfeit', title: (count) => `Δικογραφία Πλαστών Νομισμάτων (${count} πρότυπα)`, items: allTemplates.filter(isCounterfeit) },
    { category: 'environment', title: (count) => `Δικογραφία Ρύπανσης Περιβάλλοντος (${count} πρότυπα)`, items: allTemplates.filter(isEnvironment) },
    { category: 'health', title: (count) => `Δικογραφία Υγειονομικού Κανονισμού (${count} πρότυπα)`, items: allTemplates.filter(isHealth) },
    { category: 'noise', title: (count) => `Δικογραφία Ηχορύπανσης Κ.Υ.Ε. (${count} πρότυπα)`, items: allTemplates.filter(isNoise) },
    { category: 'camping', title: (count) => `Δικογραφία Παράνομου Camping (${count} πρότυπα)`, items: allTemplates.filter(isCamping) },
    { category: 'commerce', title: (count) => `Δικογραφία Παρεμπορίου (${count} έντυπα)`, items: allTemplates.filter(isCommerce) },
    { category: 'domestic', title: (count) => `Δικογραφία Ενδοοικογενειακής Βίας (${count} έντυπα)`, items: allTemplates.filter((t) => t.category === 'domestic') },
    { category: 'migration', title: (count) => `Δικογραφία Απελάσεων Αλλοδαπών (${count} έντυπα)`, items: allTemplates.filter((t) => t.category === 'migration') },
    { category: 'traffic', title: (count) => `Δικογραφία Τροχαίων Ατυχημάτων (${count} έντυπα)`, items: allTemplates.filter((t) => t.category === 'traffic') },
    { category: 'kok', title: (count) => `Δικογραφία Παραβάσεων Κ.Ο.Κ. (${count} έντυπα)`, items: allTemplates.filter((t) => t.category === 'kok') },
    { category: 'animal', title: (count) => `Δικογραφία Προστασίας Ζώων (${count} έντυπα)`, items: allTemplates.filter((t) => t.category === 'animal') },
    { category: 'generic', title: (count) => `Λοιπές Υποθέσεις (${count} έντυπα)`, items: allTemplates.filter((t) => t.category === 'generic') },
    { category: null, title: (count) => `Πρόσθετα / προσαρμοσμένα πρότυπα (${count})`, items: allTemplates.filter(isCustom) }
  ];

  groups.forEach((group) => {
    if (!group.category && !group.items.length) return;
    const details = document.createElement('details');
    details.className = 'template-category';
    const categoryKey = group.category || 'custom';
    details.open = expandedCategories.has(categoryKey);
    const heading = document.createElement('summary');
    heading.className = 'template-category-heading';
    const categorySeeded = !group.category || !CATEGORY_SEED_KEYS[group.category] || !!storage().getItem(CATEGORY_SEED_KEYS[group.category]);
    heading.textContent = group.title(group.items.length) + (categorySeeded ? '' : ' · άνοιγμα για φόρτωση');
    details.appendChild(heading);
    const panel = document.createElement('div');
    panel.className = 'template-category-content';
    details.appendChild(panel);
    if (group.items.length) {
      const batchButton = document.createElement('button');
      batchButton.type = 'button';
      batchButton.className = 'mini-button';
      batchButton.textContent = 'Συμπλήρωση όλων των εντύπων της κατηγορίας (ZIP)';
      batchButton.addEventListener('click', () => {
        const selectedCase = getCase();
        if (!selectedCase || !selectedCase.id) {
          window.alert('Επίλεξε πρώτα τη συγκεκριμένη υπόθεση που αφορά η δικογραφία.');
          return;
        }
        const selectedTemplates = templatesForCategoryGeneration(group.items);
        const missing = selectedTemplates.flatMap((template) => getMissingTemplateFields(template, selectedCase)
          .map((entry) => `${template.name}: {{${entry.field}}} — ${entry.reason}`));
        if (missing.length && !window.confirm('Ορισμένα πεδία χρειάζονται συμπλήρωση ή αντιστοίχιση:\n\n' + missing.join('\n') + '\n\nΝα συνεχιστεί η παραγωγή; Τα κενά πεδία θα παραμείνουν εμφανή για έλεγχο.')) return;
        try {
          const archive = buildCategoryArchive(selectedTemplates, selectedCase);
          const blob = new Blob([archive], { type: 'application/zip' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          const caseName = String(selectedCase.title || 'δικογραφία').replace(/[\\/:*?"<>|]+/gu, '-');
          link.href = url;
          link.download = `${caseName}-${categoryKey}-έντυπα.zip`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
          window.alert('Δεν δημιουργήθηκε ο φάκελος εντύπων: ' + error.message);
        }
      });
      panel.appendChild(batchButton);
    }
    if (group.category && window.AXYP_ROLE && window.AXYP_ROLE.isAdmin()) {
      const authored = group.items.filter((template) => template.source === 'user-uploaded' || template.source === 'published-package');
      if (authored.length) {
        const publishButton = document.createElement('button');
        publishButton.type = 'button';
        publishButton.className = 'mini-button';
        publishButton.textContent = 'Εξαγωγή επίσημου πακέτου για δημοσίευση';
        publishButton.addEventListener('click', () => {
          try {
            const archive = buildOfficialDossierPackage(authored, group.category);
            const blob = new Blob([archive], { type: 'application/zip' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'axyp-' + group.category + '-official-package.axyp.zip';
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
          } catch (error) {
            window.alert('Δεν δημιουργήθηκε το επίσημο πακέτο: ' + error.message);
          }
        });
        panel.appendChild(publishButton);
      }
    }
    root.appendChild(details);
    details.addEventListener('toggle', async () => {
      if (!details.open) {
        expandedCategories.delete(categoryKey);
        return;
      }
      expandedCategories.add(categoryKey);
      if (!group.category || !CATEGORY_LOADERS[group.category]) return;
      panel.textContent = 'Φόρτωση προτύπων…';
      try {
        await ensureDefaultTemplates(storage(), group.category);
        render();
      } catch (error) {
        panel.textContent = 'Δεν ήταν δυνατή η φόρτωση αυτής της κατηγορίας. Έλεγξε τη σύνδεση και δοκίμασε ξανά.';
        console.error('Template category loading failed:', group.category, error);
      }
    });
    if (!details.open) return;

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
        isEnvironment(template) ? 'Ρύπανση περιβάλλοντος' :
        isHealth(template) ? 'Υγειονομικός κανονισμός' :
        isNarcotics(template) ? 'Δικογραφία Ναρκωτικών' :
        'Προσαρμοσμένο'
      );
      card.querySelector('.mapping-status').textContent = template.status === 'temporary' ? 'ΠΡΟΣΩΡΙΝΟ' : catLabel;
      const caseNote = currentCase && currentCase.title ? ` (ενεργή υπόθεση: «${currentCase.title}»)` : ' (δεν έχει επιλεγεί υπόθεση)';
      card.querySelector('p').textContent = `${template.statusLabel ? template.statusLabel + '. ' : ''}${template.fields.length} placeholders εντοπίστηκαν${caseNote}.`;

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

      if (template.source === 'published-package') {
        card.querySelector('.remove').hidden = true;
        card.querySelector('.save-mapping').hidden = true;
        card.querySelectorAll('.mapping-row select').forEach((select) => { select.disabled = true; });
      }

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
      panel.appendChild(card);
    });
  });

  if (!root.children.length) root.textContent = 'Δεν έχει εισαχθεί ακόμη πραγματικό πρότυπο Word.';
}

async function reviewAnonymizationCandidates(fileName, candidates, parts) {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'docx-anonymization-title');
  dialog.style.maxWidth = 'min(760px, 94vw)';
  dialog.style.maxHeight = '85vh';
  dialog.style.overflow = 'auto';
  dialog.style.padding = '1rem';
  dialog.style.borderRadius = '12px';
  dialog.style.border = '1px solid #888';
  const title = document.createElement('h2');
  title.id = 'docx-anonymization-title';
  title.textContent = 'Έλεγχος προσωπικών στοιχείων';
  const intro = document.createElement('p');
  intro.textContent = `Αρχείο: ${fileName}. Επίλεξε ποιες προτεινόμενες αντικαταστάσεις θα εφαρμοστούν. Το αρχικό αρχείο δεν τροποποιείται.`;
  const warning = document.createElement('p');
  warning.textContent = 'Η αυτόματη ανίχνευση δεν εγγυάται πλήρη ανωνυμοποίηση. Έλεγξε και χειροκίνητα όλο το έγγραφο, ιδίως ονόματα μέσα στο αφηγηματικό κείμενο, χειρόγραφες σημειώσεις, σφραγίδες και εικόνες.';
  warning.setAttribute('role', 'note');
  const list = document.createElement('div');
  list.style.display = 'grid';
  list.style.gap = '0.65rem';
  const controls = [];
  candidates.forEach((candidate, index) => {
    const label = document.createElement('label');
    label.style.display = 'grid';
    label.style.gridTemplateColumns = 'auto minmax(0, 1fr)';
    label.style.gap = '0.5rem';
    label.style.padding = '0.55rem';
    label.style.border = '1px solid #aaa';
    label.style.borderRadius = '8px';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = candidate.confidence === 'high';
    checkbox.value = String(index);
    const description = document.createElement('span');
    description.textContent = `${candidate.label}: «${candidate.value}» → ${candidate.placeholder} (${candidate.partName})`;
    label.append(checkbox, description);
    list.appendChild(label);
    controls.push(checkbox);
  });
  if (!candidates.length) {
    const empty = document.createElement('p');
    empty.textContent = 'Δεν εντοπίστηκαν αυτόματα αναγνωριστικά στοιχεία. Αυτό δεν σημαίνει ότι το έγγραφο είναι ανωνυμοποιημένο.';
    list.appendChild(empty);
  }

  const manualHeading = document.createElement('h3');
  manualHeading.textContent = 'Χειροκίνητες αντικαταστάσεις';
  const manualHint = document.createElement('p');
  manualHint.textContent = 'Πρόσθεσε ονόματα, διευθύνσεις ή άλλα ακριβή αποσπάσματα που δεν εντοπίστηκαν αυτόματα. Η αντικατάσταση εφαρμόζεται σε κάθε εμφάνιση μέσα στις παραγράφους Word.';
  const manualRows = document.createElement('div');
  manualRows.style.display = 'grid';
  manualRows.style.gap = '0.5rem';
  const placeholderOptions = [
    ['person.fullName', 'Ονοματεπώνυμο'],
    ['person.fatherName', 'Πατρώνυμο'],
    ['person.motherName', 'Μητρώνυμο'],
    ['person.idNumber', 'Αριθμός ταυτότητας'],
    ['person.address', 'Διεύθυνση'],
    ['person.taxId', 'Α.Φ.Μ.'],
    ['person.phone', 'Τηλέφωνο'],
    ['person.email', 'Email'],
    ['vehicle.registration', 'Αριθμός κυκλοφορίας'],
    ['case.protocolNumber', 'Αριθμός πρωτοκόλλου'],
    ['case.location', 'Τόπος σύνταξης'],
    ['incident.location', 'Τόπος συμβάντος']
  ];
  const addManualRow = () => {
    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = 'minmax(0, 1fr) minmax(150px, 0.7fr) auto';
    row.style.gap = '0.4rem';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Ακριβές κείμενο προς αντικατάσταση';
    input.setAttribute('aria-label', 'Ακριβές κείμενο προς αντικατάσταση');
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Πεδίο αντικατάστασης');
    placeholderOptions.forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Αφαίρεση';
    remove.addEventListener('click', () => row.remove());
    row.append(input, select, remove);
    manualRows.appendChild(row);
  };
  const addManual = document.createElement('button');
  addManual.type = 'button';
  addManual.textContent = 'Προσθήκη χειροκίνητης αντικατάστασης';
  addManual.addEventListener('click', addManualRow);
  const manualError = document.createElement('p');
  manualError.setAttribute('role', 'alert');
  manualError.style.color = '#b00020';

  const reviewedLabel = document.createElement('label');
  reviewedLabel.style.display = 'flex';
  reviewedLabel.style.gap = '0.5rem';
  reviewedLabel.style.margin = '1rem 0';
  const reviewed = document.createElement('input');
  reviewed.type = 'checkbox';
  const reviewedText = document.createElement('span');
  reviewedText.textContent = 'Έλεγξα χειροκίνητα και τα υπόλοιπα μέρη του εγγράφου. Δεν βασίζομαι μόνο στην αυτόματη ανίχνευση.';
  reviewedLabel.append(reviewed, reviewedText);
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.justifyContent = 'flex-end';
  actions.style.gap = '0.5rem';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Ακύρωση εισαγωγής';
  const accept = document.createElement('button');
  accept.type = 'button';
  accept.textContent = 'Αποθήκευση ανωνυμοποιημένου προτύπου';
  accept.disabled = true;
  reviewed.addEventListener('change', () => { accept.disabled = !reviewed.checked; });
  cancel.addEventListener('click', () => dialog.close('cancel'));
  actions.append(cancel, accept);
  dialog.append(title, intro, warning, list, manualHeading, manualHint, manualRows, addManual, manualError, reviewedLabel, actions);
  document.body.appendChild(dialog);
  if (typeof dialog.showModal !== 'function') {
    dialog.remove();
    window.alert('Η ασφαλής προεπισκόπηση DOCX δεν υποστηρίζεται σε αυτό το πρόγραμμα περιήγησης. Η εισαγωγή ακυρώθηκε χωρίς να αποθηκευτεί το αρχείο.');
    return null;
  }
  return new Promise((resolve) => {
    accept.addEventListener('click', () => {
      if (!reviewed.checked) return;
      const entries = [...manualRows.children].map((row) => ({
        value: row.querySelector('input').value.trim(),
        placeholder: `{{${row.querySelector('select').value}}}`
      })).filter((entry) => entry.value);
      const manualCandidates = createManualAnonymizationCandidates(parts, entries);
      const unmatched = entries.filter((entry) => !manualCandidates.some((candidate) =>
        candidate.value === entry.value && candidate.placeholder === entry.placeholder
      ));
      if (unmatched.length) {
        manualError.textContent = 'Δεν βρέθηκε στο κείμενο του Word: ' + unmatched.map((entry) => entry.value).join(', ');
        return;
      }
      dialog.close('accept');
      dialog.addEventListener('close', () => {
        const selected = candidates.filter((_candidate, index) => controls[index].checked);
        resolve([...selected, ...manualCandidates]);
      }, { once: true });
    });
    dialog.addEventListener('close', () => {
      if (dialog.returnValue !== 'accept') resolve(null);
      dialog.remove();
    }, { once: true });
    dialog.showModal();
  });
}

async function importTemplate(event) {
  if (!window.AXYP_ROLE || !window.AXYP_ROLE.isAdmin()) { event.target.value = ''; return; }
  const file = event.target.files[0];
  if (!file) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parts = unzipSync(bytes);
    if (!parts['word/document.xml']) throw new Error('Το αρχείο δεν περιέχει το κύριο σώμα Word.');
    const candidates = detectDocxPersonalData(parts);
    const approved = await reviewAnonymizationCandidates(file.name, candidates, parts);
    if (!approved) return;
    const anonymizedParts = anonymizeDocxParts(parts, approved);

    // Only the reviewed derivative is added to the template library. The uploaded File is never modified.
    const allXml = Object.keys(anonymizedParts)
      .filter((name) => name.startsWith('word/') && name.endsWith('.xml'))
      .map((name) => new TextDecoder().decode(anonymizedParts[name] || new Uint8Array()))
      .join('\n');
    const detected = extractFields(allXml);
    const documentXml = new TextDecoder().decode(anonymizedParts['word/document.xml']);
    const templates = read();
    const category = $('template-category')?.value || 'custom';
    templates.push({
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `custom-${Date.now()}-${templates.length}`,
      name: file.name,
      category,
      categoryLabel: category === 'custom' ? 'Προσαρμοσμένο έντυπο' : 'Ανεβασμένο αυθεντικό έντυπο',
      source: 'user-uploaded',
      fidelityMode: 'placeholder-only',
      fields: detected,
      documentXml,
      anonymizationReviewedAt: new Date().toISOString(),
      anonymizationCandidateCount: candidates.length,
      anonymizationAppliedCount: approved.length,
      files: Object.fromEntries(Object.entries(anonymizedParts).map(([name, data]) => [name, Array.from(data)]))
    });
    write(templates);
    render();
  } catch (error) {
    window.alert('Δεν ήταν δυνατή η ασφαλής εισαγωγή του αρχείου Word: ' + error.message);
  } finally {
    event.target.value = '';
  }
}

function replaceTextAcrossWordRuns(xml, pattern, replacement) {
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gu, (paragraph) => {
    const nodes = [...paragraph.matchAll(/(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/gu)];
    if (!nodes.length) return paragraph;

    const values = nodes.map((match) => unesc(match[2]));
    const plainText = values.join('');
    const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
    const matches = [...plainText.matchAll(new RegExp(pattern.source, flags))];
    if (!matches.length) return paragraph;

    for (const match of matches.reverse()) {
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;
      let offset = 0;
      let first = -1;
      let last = -1;
      let firstOffset = 0;
      let lastEnd = 0;

      for (let index = 0; index < values.length; index++) {
        const nodeStart = offset;
        const nodeEnd = nodeStart + values[index].length;
        if (first === -1 && matchStart < nodeEnd && matchEnd > nodeStart) {
          first = index;
          firstOffset = matchStart - nodeStart;
        }
        if (matchStart < nodeEnd && matchEnd > nodeStart) {
          last = index;
          lastEnd = matchEnd - nodeStart;
        }
        offset = nodeEnd;
      }
      if (first === -1 || last === -1) continue;

      if (first === last) {
        values[first] = values[first].slice(0, firstOffset) + replacement + values[first].slice(lastEnd);
      } else {
        values[first] = values[first].slice(0, firstOffset) + replacement;
        for (let index = first + 1; index < last; index++) values[index] = '';
        values[last] = values[last].slice(lastEnd);
      }
    }

    let index = 0;
    return paragraph.replace(/(<w:t\b[^>]*>)[\s\S]*?(<\/w:t>)/gu, (_match, open, close) =>
      open + esc(values[index++]) + close
    );
  });
}

function replaceLegacyLocalServiceReferences(xml) {
  const replacements = [
    [/ΔΙΕΥΘΥΝΣΗ\s+ΑΣΤΥΝΟΜΙΑΣ\s+ΜΕΣΣΗΝΙΑΣ/giu, '{{service.directorate}}'],
    [/ΑΣΤΥΝΟΜΙΚΟ\s+ΤΜΗΜΑ\s+ΤΡΙΦΥΛΙΑΣ(?:\s+ΜΕΣΣΗΝΙΑΣ)?/giu, '{{service.name}}'],
    [/(?:ΤΑΧ\.\s*Δ\/ΝΣΗ\s*:\s*|Δ\/νση:\s*)?60\s*[οo]?\s*χλμ\.\s*Ε\.?Ο\.?\s*Π[Υύ]ργου\s*[-–]\s*Μεθ[ώω]νης/giu, 'ΤΑΧ. Δ/ΝΣΗ: {{service.address}}'],
    [/ΤΑΧ\.\s*Δ\/ΝΣΗ:\s*60ο\s*χλμ\.\s*Ε\.Ο\.\s*ΠΥΡΓΟΥ-ΜΕΘΩΝΗΣ/giu, 'ΤΑΧ. Δ/ΝΣΗ: {{service.address}}'],
    [/Τ\.?\s*Κ\.?\s*24500\s*ΚΥΠΑΡΙΣΣΙΑ(?:\s*ΜΕΣΣΗΝΙΑ)?/giu, ''],
    [/2761440970|2761062000/gu, '{{service.phone}}'],
    [/at\.trifylias@astynomia\.gr/giu, '{{service.email}}'],
    [/,?\s*Fax\s*2131527691/giu, ''],
    [/Αντεισαγγελέα\s+Πλημ\/κων\s+Κυπαρισσίας/giu, 'αρμόδιου Αντεισαγγελέα'],
    [/ΕΙΣΑΓΓΕΛΙΑ\s*(?:ΠΛΗΜΜΕΛΕΙΟΔΙΚΩΝ|ΠΡΩΤΟΔΙΚΩΝ)\s*ΚΥΠΑΡΙΣΣΙΑΣ/giu, '{{service.prosecutor}}'],
    [/(?:ΠΛΗΜΜΕΛΕΙΟΔΙΚΩΝ|ΠΡΩΤΟΔΙΚΩΝ)\s*ΚΥΠΑΡΙΣΣΙΑΣ/giu, '{{service.prosecutor}}'],
    [/(?:Πλημμελειοδικών|Πρωτοδικών)\s+Κυπαρισσίας/giu, '{{service.prosecutor}}'],
    [/δικηγορικού\s+Συλλόγου\s+Κυπαρισσίας/giu, 'οικείου Δικηγορικού Συλλόγου'],
    [/E-mail:\s*forgelab@otenet\.gr/giu, ''],
    [/Ελαία\s+Τριφυλίας\s+Μεσσηνίας/giu, '{{case.location}}'],
    [/Κυπαρισσία,\s*(?=\{\{case\.date\}\})/giu, '{{case.location}}, '],
    [/Κυπαρισσία,\s*(?=\d{1,2}\/\d{1,2}\/\d{4})/giu, '{{case.location}}, ']
  ];

  let result = xml;
  for (const [pattern, value] of replacements) {
    result = replaceTextAcrossWordRuns(result, pattern, value);
  }

  let previousParagraphText = '';
  result = result.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gu, (paragraph) => {
    const paragraphText = [...paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gu)]
      .map((match) => match[1])
      .join('');
    if (/Πλημ\/κων\s*$/u.test(previousParagraphText.trim()) && /^\s*Κυπαρισσίας\./u.test(paragraphText.trim())) {
      paragraph = replaceTextAcrossWordRuns(paragraph, /Κυπαρισσίας/gu, '');
    }
    previousParagraphText = paragraphText;
    return paragraph;
  });

  return result
    .replace(/,\s*(?:κατοίκων|κάτοικων)\s+Α\.Τ\.\s+Τριφυλίας/gu, ' της ίδιας Υπηρεσίας')
    .replace(/κατ\.\s+Α\.Τ\.\s+Τριφυλίας/gu, 'της Υπηρεσίας μας')
    .replace(/Αξιωματικό Υπηρεσίας του Α\.Τ\.\s+Τριφυλίας/gu, 'Αξιωματικό Υπηρεσίας')
    .replace(/στο κατάστημα του Αστυνομικού Τμήματος Τριφυλίας/gu, 'στο κατάστημα της Υπηρεσίας μας')
    .replace(/του Αστυνομικού Τμήματος Τριφυλίας/gu, 'της Υπηρεσίας μας')
    .replace(/του Α\.Τ\.\s+Τριφυλίας/gu, 'της Υπηρεσίας μας')
    .replace(/στο Α\.Τ\.\s+Τριφυλίας/gu, 'στην Υπηρεσία μας')
    .replace(/Αστυνομικού Τμήματος Τριφυλίας/gu, 'Υπηρεσίας μας')
    .replace(/Αστυνομικό Τμήμα Τριφυλίας/gu, 'Υπηρεσία μας')
    .replace(/Α\.Τ\.\s+Τριφυλίας/gu, 'Υπηρεσία μας');
}

function replaceLegacyFixedDateText(xml, item) {
  const day = valueFor('case.date.day', item);
  const month = valueFor('case.date.monthName', item);
  const year = valueFor('case.date.year', item);
  const weekday = valueFor('case.date.weekdayName', item);
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(item.date || ''));
  if (!dateMatch || !day || !month || !year || !weekday) return xml;

  const location = esc(item.location || 'έδρα της Υπηρεσίας');
  const numericDate = `${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}`;
  return xml
    .replace(
      /(Στην\s+)Κυπαρισσία(\s+σήμερα\s+την\s+)\d{1,2}(η?)(\s+του\s+(?:μηνός|μήνα)\s+)[\p{L}]+(\s+του\s+έτους\s+)\d{4}(\s+ημέρα(?:\s+της\s+εβδομάδος)?\s+)(?:Μ\.\s*)?[\p{L}΄’']+/gu,
      (_match, prefix, beforeDay, ordinal, monthPrefix, yearPrefix, weekdayPrefix) =>
        `${prefix}${location}${beforeDay}${esc(day)}${ordinal}${monthPrefix}${esc(month)}${yearPrefix}${esc(year)}${weekdayPrefix}${esc(weekday)}`
    )
    .replace(/Κυπαρισσία,\s*\d{4}-\d{2}-\d{2}/gu, `${location}, ${numericDate}`)
    .replace(/Κυπαρισσία,\s*\d{1,2}\s+[\p{L}]+\s+\d{4}/gu, `${location}, ${esc(day)} ${esc(month)} ${esc(year)}`)
    .replace(/(ώρα\s+της\s+)\d{1,2}\/\d{1,2}\/\d{4}/gu, `$1${numericDate}`)
    .replace(/\(\d{1,2}\/\d{1,2}\/\d{4}\)/gu, `(${numericDate})`);
}

function signatureParagraphTable() {
  const paragraph = (value) => `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">${esc(value)}</w:t></w:r></w:p>`;
  const cell = (label, field) => `<w:tc><w:tcPr><w:tcW w:w="4680" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${paragraph(label)}${paragraph('________________________')}${paragraph(`{{${field}}}`)}</w:tc>`;
  const nil = '<w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/>';
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/><w:tblBorders>${nil}</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4680"/><w:gridCol w:w="4680"/></w:tblGrid><w:tr>${cell('Ο Συλλαβών','case.arrestingOfficer')}${cell('Ο Συλληφθείς','person.fullName')}</w:tr><w:tr>${cell('Ο Β΄ Ανακριτικός Υπάλληλος','officerB.fullName')}${cell('Ο Α΄ Ανακριτικός Υπάλληλος','officerA.fullName')}</w:tr></w:tbl>`;
}

export function patchNarcoticsTemplateXml(xml, templateId) {
  if (templateId === 'noise-02') return xml.replace(/\{\{case\.location\}\}/gu, '{{incident.location}}');
  if (templateId === 'narcotics-01') {
    xml = xml.replace(/στην ευρύτερη περιοχή\s*\.{3,}/u, 'στην {{incident.location}}');
    xml = xml.replace(/(Περί ώρα)\s*\.{3,}(\s+στην)\s*\.{3,}(,\s*εντοπίσαμε)/u, '$1 {{incident.time}}$2 {{incident.location}}$3');
  }
  if (templateId === 'narcotics-02') {
    xml = xml.replace(/(Στην\s+\{\{case\.location\}\}\s+σήμερα\s+την\s+)\.{3,}(\s+του\s+μηνός\s+)\.{3,}(\s+του\s+έτους\s+)\.{3,}(\s+ημέρα\s+της\s+εβδομάδος\s+)\.{3,}/u, '$1{{case.date.day}}$2{{case.date.monthName}}$3{{case.date.year}}$4{{case.date.weekdayName}}');
    xml = xml.replace(/(Εισαγγελέα\s+Πρωτοδικών\s+)\.{3,}/u, '$1{{case.prosecutor}}');
    const oldService = /(?:της ίδιας Υπηρεσίας,\s*)?(?:που προσλήφθηκε ως )?Β[’'] Ανακριτικός Υπάλληλος,\s*(?:κάτοικων|κατοίκων) Α\.Τ\. Τριφυλίας/u;
    if (oldService.test(xml)) {
      xml = xml.replace(oldService, 'που υπηρετεί στο {{officerB.service}} και ενεργεί ως Β΄ Ανακριτικός Υπάλληλος');
    }
    let replacedSignature = false;
            const signatureTable = signatureParagraphTable();
    xml = xml.replace(new RegExp('<w:p[^>]*>[^]*?</w:p>', 'gu'), (paragraph) => {
      if (!replacedSignature && /Ο\s+Συλλαβών/u.test(paragraph) && /Ο\s+Συλληφθείς/u.test(paragraph) && /Ανακριτικός Υπάλληλος/u.test(paragraph)) {
        replacedSignature = true;
        return signatureTable;
      }
      return paragraph;
    });
    if (replacedSignature) {
      // The original four-signature layout placed a separate dotted line
      // paragraph immediately after the signature paragraph. Once the
      // paragraph is replaced by a real table, that old line is redundant.
      const tableEnd = xml.indexOf(signatureTable) + signatureTable.length;
      const tail = xml.slice(tableEnd);
      const nextParagraph = tail.match(/^\s*(<w:p\b[\s\S]*?<\/w:p>)/u);
      if (nextParagraph) {
        const text = nextParagraph[1].replace(/<[^>]+>/gu, '').replace(/&amp;/gu, '&').trim();
        const dotRuns = text.match(/[.·…_]{3,}/gu) || [];
        if (/^[.·…_\s]+$/u.test(text) && dotRuns.length >= 3) {
          xml = xml.slice(0, tableEnd) + tail.replace(nextParagraph[1], '');
        }
      }
    }
  }
  if (templateId === 'narcotics-06') {
    xml = xml.replace(/(την\s+)\.{3,}(\s+ώρα\s+και\s+περατώθηκε\s+την\s+)\.{3,}(\s+ώρα\s+της\s+\{\{case\.date\}\})/u, '$1{{timeline.examination.startTime}}$2{{timeline.examination.endTime}}$3');
  }
  if (templateId === 'narcotics-08') {
    xml = xml.replace(/Εισαγγελία Πρωτοδικών\s*\.{5,}/u, 'Εισαγγελία Πρωτοδικών {{case.prosecutor}}');
    xml = xml.replace(/\.{5,},\s*\{\{case\.date\}\}/u, '{{case.location}}, {{case.date}}');
  }
  if (templateId === 'narcotics-09') {
    xml = xml.replace(/ΚΑΛΑΜΑΤΑ\s+Τ\.Κ\.\s*241\s*00/u, 'Πάρκο Λιμενικού, Τ.Κ. 24131, Καλαμάτα');
  }
  return xml;
}

export function correctOfficerServicePlaceholders(xml) {
  return xml
    .replace(/(?:κατοίκων|κάτοικων)\s*\{\{\s*officerA\.service\s*\}\}/gu, 'που υπηρετεί στο {{officerB.service}}')
    .replace(/κατ\.\s*\{\{\s*officerA\.service\s*\}\}/gu, 'που υπηρετεί στο {{officerB.service}}');
}

export function normalizeGreekDocxXml(xml) {
  const fixes = (value) => value
    .replace(/ενώπιιον/gu, 'ενώπιον')
    .replace(/κατηγορούμενου/gu, 'κατηγορουμένου')
    .replace(/κρατούμενου/gu, 'κρατουμένου')
    .replace(/επισκέψείς/gu, 'επισκέψεις')
    .replace(/ποιά/gu, 'ποια')
    .replace(/σηματική αναφορά μας/gu, 'σχετική αναφορά μας')
    .replace(/Yποβολή/gu, 'Υποβολή')
    .replace(/Β[’']/gu, 'Β΄')
    .replace(/\s+([,.;:!?])/gu, '$1')
    // Ensure space after commas when followed by a letter (avoiding numeric decimals like 1,5)
  .replace(/,([\p{L}])/gu, ', $1');
  return xml.replace(/(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/gu, (_match, open, text, close) => open + fixes(text) + close);
}

export const DOCX_TEMPLATE_VERSION = '2026.11.06.1';

function ensureTemplateVersionFooter(files, template) {
  const documentPath = 'word/document.xml';
  if (!files[documentPath]) throw new Error('DOCX main document is missing');

  const decode = (bytes) => new TextDecoder().decode(bytes);
  const encode = (value) => new TextEncoder().encode(value);
  const documentXml = decode(files[documentPath]);
  const relsPath = 'word/_rels/document.xml.rels';
  let relsXml = files[relsPath]
    ? decode(files[relsPath])
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

  const footerRelationship = [...relsXml.matchAll(/<Relationship\b(?=[^>]*\bId="([^"]+)")(?=[^>]*\bType="[^"]*\/footer")(?=[^>]*\bTarget="([^"]+)")[^>]*\/?\s*>/gu)]
    .map((match) => ({ id: match[1], target: match[2] }));
  const targetToPath = (target) => target.startsWith('/') ? target.slice(1) : `word/${target.replace(/^\.\//u, '')}`;
  const referencedDefault = documentXml.match(/<w:footerReference\b(?=[^>]*\bw:type="default")(?=[^>]*\br:id="([^"]+)")[^>]*\/?\s*>/u);
  let footerRel = referencedDefault
    ? footerRelationship.find((entry) => entry.id === referencedDefault[1])
    : footerRelationship[0];
  let footerPath = footerRel ? targetToPath(footerRel.target) : '';
  const canReuseExistingFooterReference = Boolean(footerRel && files[footerPath]);

  if (!canReuseExistingFooterReference) {
    let index = 1;
    do { footerPath = `word/footer${index++}.xml`; } while (files[footerPath]);
    const usedIds = [...relsXml.matchAll(/\bId="rId(\d+)"/gu)].map((match) => Number(match[1]));
    const relId = `rId${Math.max(0, ...usedIds) + 1}`;
    relsXml = relsXml.replace(
      '</Relationships>',
      `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="${footerPath.slice(5)}"/></Relationships>`
    );
    footerRel = { id: relId, target: footerPath.slice(5) };
  }

  const footerLabel = `AX.YP • Πρότυπο: ${template.id || template.name || 'unknown'} • Έκδοση: ${DOCX_TEMPLATE_VERSION}`;
  let footerXml = files[footerPath]
    ? decode(files[footerPath])
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p/></w:ftr>';

  if (!footerXml.includes(footerLabel)) {
    const paragraph = `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/><w:color w:val="666666"/></w:rPr><w:t xml:space="preserve">${esc(footerLabel)}</w:t></w:r></w:p>`;
    footerXml = footerXml.replace('</w:ftr>', paragraph + '</w:ftr>');
  }
  files[footerPath] = encode(footerXml);
  files[relsPath] = encode(relsXml);

  let updatedDocumentXml = documentXml;
  if (referencedDefault && !canReuseExistingFooterReference) {
    updatedDocumentXml = updatedDocumentXml.replace(/(<w:footerReference\b(?=[^>]*\bw:type="default")[^>]*\br:id=")[^"]+("[^>]*\/?\s*>)/u, `$1${footerRel.id}$2`);
  }
  if (!/<w:footerReference\b(?=[^>]*\bw:type="default")/u.test(updatedDocumentXml)) {
    const reference = `<w:footerReference w:type="default" r:id="${footerRel.id}"/>`;
    if (/<w:sectPr\b[^>]*>/u.test(updatedDocumentXml)) {
      updatedDocumentXml = updatedDocumentXml.replace(/(<w:sectPr\b[^>]*>)/u, `$1${reference}`);
    } else {
      updatedDocumentXml = updatedDocumentXml.replace('</w:body>', `<w:sectPr>${reference}</w:sectPr></w:body>`);
    }
  }
  const documentRootTag = (updatedDocumentXml.match(/<w:document\b[^>]*>/u) || [''])[0];
  if (!/\bxmlns:r="/u.test(documentRootTag)) {
    updatedDocumentXml = updatedDocumentXml.replace(/<w:document\b/u, '<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
  }
  files[documentPath] = encode(updatedDocumentXml);

  const contentTypesPath = '[Content_Types].xml';
  let contentTypes = decode(files[contentTypesPath]);
  if (!contentTypes.includes(`PartName="/${footerPath}"`)) {
    contentTypes = contentTypes.replace(
      '</Types>',
      `<Override PartName="/${footerPath}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`
    );
    files[contentTypesPath] = encode(contentTypes);
  }
}

export function buildDocx(template, item) {
  if (!template || !item) throw new Error('Template and case data are required');
  const files = getTemplateParts(template);
  const userUploaded = template.source === 'user-uploaded' || template.source === 'published-package' || (!template.category && !!template.files);

  Object.keys(files).forEach((filename) => {
    if (!filename.startsWith('word/') || !filename.endsWith('.xml')) return;
    const originalXml = new TextDecoder().decode(files[filename]);

    if (userUploaded) {
      // Uploaded official forms are authoritative: resolve placeholders only.
      // No legacy service/date substitutions, wording corrections, footer injection,
      // signature-table patches or broad typography normalization are permitted.
      const placeholderXml = normalizeDocxXml(originalXml);
      files[filename] = new TextEncoder().encode(replaceInXml(placeholderXml, template, item, { preserveMissing: true }));
      return;
    }

    const templatePatched = template.category === 'narcotics' ? patchNarcoticsTemplateXml(originalXml, template.id) : originalXml;
    const correctedServicePlaceholders = correctOfficerServicePlaceholders(templatePatched);
    const withCurrentServiceReferences = replaceLegacyLocalServiceReferences(correctedServicePlaceholders);
    const populated = replaceInXml(withCurrentServiceReferences, template, item);
    const withCurrentDates = replaceLegacyFixedDateText(populated, item);
    files[filename] = new TextEncoder().encode(normalizeGreekDocxXml(withCurrentDates));
  });

  if (!userUploaded) ensureTemplateVersionFooter(files, template);
  return zipSync(files);
}

export function templatesForCategoryGeneration(templates) {
  const list = Array.isArray(templates) ? templates : [];
  const uploaded = list.filter((template) =>
    template && (template.source === 'user-uploaded' || template.source === 'published-package' || (!template.category && !!template.files))
  );
  // Never mix the user's authentic forms with approximate built-in examples.
  return uploaded.length ? uploaded : list;
}

export function buildOfficialDossierPackage(templates, category) {
  if (!Array.isArray(templates) || !category) throw new Error('Επίλεξε κατηγορία με έντυπα.');
  const documents = templates.filter((template) =>
    template && template.category === category &&
    (template.source === 'user-uploaded' || template.source === 'published-package')
  );
  if (!documents.length) throw new Error('Δεν υπάρχουν αυθεντικά έντυπα για δημοσίευση σε αυτή την κατηγορία.');
  const packageFiles = {};
  const manifestDocuments = documents.map((template, index) => {
    if (!template.mappingConfirmedAt) throw new Error('Πρέπει πρώτα να επιβεβαιωθεί η αντιστοίχιση πεδίων για το έντυπο «' + template.name + '».');
    const safeId = String(template.id || index + 1).replace(/[^\\p{L}\\p{N}-]+/gu, '-').slice(0, 48) || String(index + 1);
    const path = 'documents/' + String(index + 1).padStart(2, '0') + '-' + safeId + '.docx';
    packageFiles[path] = zipSync(getTemplateParts(template));
    return {
      id: String(template.id || safeId),
      name: String(template.name || 'Έντυπο Word'),
      path,
      fields: Array.isArray(template.fields) ? template.fields : [],
      mappings: template.mappings && typeof template.mappings === 'object' ? template.mappings : {}
    };
  });
  packageFiles['manifest.json'] = new TextEncoder().encode(JSON.stringify({
    schemaVersion: 1,
    category,
    createdAt: new Date().toISOString(),
    documents: manifestDocuments
  }, null, 2));
  return zipSync(packageFiles);
}

export function buildCategoryArchive(templates, item) {
  if (!Array.isArray(templates) || !templates.length) throw new Error('Δεν υπάρχουν έντυπα στην επιλεγμένη κατηγορία.');
  if (!item || !item.id) throw new Error('Επίλεξε πρώτα συγκεκριμένη υπόθεση.');
  const archive = {};
  templates.forEach((template, index) => {
    const baseName = String(template.name || `entypo-${index + 1}.docx`)
      .replace(/[\\/:*?"<>|]+/gu, '-')
      .replace(/\.docx$/iu, '');
    const suffix = String(template.id || index + 1).replace(/[^\p{L}\p{N}-]+/gu, '-').slice(0, 32);
    archive[`${String(index + 1).padStart(2, '0')}-${baseName}-${suffix}.docx`] = buildDocx(template, item);
  });
  return zipSync(archive);
}

export async function generate(template) {
  const item = getCase();
  if (!item || !item.id) {
    if (typeof window !== 'undefined' && window.alert) {
      window.alert('Επίλεξε ρητά την υπόθεση που αφορά το έγγραφο πριν από τη συμπλήρωση.');
    }
    return;
  }
  const missingFields = getMissingTemplateFields(template, item);
  if (missingFields.length) {
    const details = missingFields.map(({ field, reason }) => `• {{${field}}} — ${reason}`).join('\n');
    const message = 'Πριν από τη λήψη του Word εντοπίστηκαν τα παρακάτω πεδία που χρειάζονται έλεγχο:\n\n' + details + '\n\nΘέλεις να συνεχίσεις τη λήψη με αυτά τα πεδία κενά;';
    if (typeof window.confirm === 'function' && !window.confirm(message)) return;
  }
  const blob = new Blob([buildDocx(template, item)], {
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
  const ready = initializeDefaultTemplates()
    .then(() => {
      render();
      if (window.HypothesesView) window.HypothesesView.refresh();
    })
    .catch((error) => {
      console.error('Template library initialization failed:', error);
      render();
      throw error;
    });
  if (typeof window !== 'undefined') {
    window.TemplateLibrary = { refresh: render, ensureDefaultTemplates, initializeDefaultTemplates, generate, getTemplateParts, getMissingTemplateFields, buildCategoryArchive, buildOfficialDossierPackage, templatesForCategoryGeneration, getCategoryTemplates: (category) => [...PUBLISHED_DOSSIER_TEMPLATES, ...read()].filter((template) => template && template.category === category), ready };
  }
}
