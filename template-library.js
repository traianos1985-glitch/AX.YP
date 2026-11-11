import { unzipSync, zipSync, unzlibSync, strFromU8, strToU8 } from './vendor/fflate.js';
import { listTemplateMappingVersions, saveTemplateMappingVersion, restoreTemplateMappingVersion } from './template-mapping-history.js';
import { toGreekGenitiveFullName, getServiceProfileOperatorIdentity } from './service-profile.js';
import { createTemplateDocumentSnapshot, appendTemplateDocumentSnapshot, restoreTemplateDocumentSnapshot, extractTemplateFieldsFromParts } from './template-document-history.js';
import { mergeTemplateOverrides } from './template-catalog.js';
import { extractTemplateTextRuns, applyTemplateTextEdits } from './template-document-editor.js';
import { getDossierFieldValue } from './dossier-fields.js';

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
let publishedPackageCatalogLoaded = false;

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

// Keep the published package's historical internal label compatible while presenting
// the exact source-document title in the generated file list and download name.
export function resolvePublishedDocumentName(category, name) {
  if (category === 'migration' && name === '05_ΕΓΓΡΑΦΟ_ΔΙΑΛΟΓΗΣ_ΑΣΥΛΟΥ.docx') {
    return '05_ΕΓΓΡΑΦΟ_ΓΙΑ_ΑΛΛΟΔΑΠΟ_ΠΟΥ_ΔΕΝ_ΕΧΕΙ_ΣΥΛΛΗΦΘΕΙ_ΞΑΝΑ.docx';
  }
  return name;
}


export async function loadPublishedDossierPackages() {
  if (publishedPackagesPromise) return publishedPackagesPromise;
  publishedPackagesPromise = (async () => {
    let response;
    try { response = await fetch(new URL('dossier-packages/manifest.json', document.baseURI)); }
    catch (_) { return []; }
    if (!response.ok) return [];
    const catalog = await response.json();
    if (!catalog || catalog.schemaVersion !== 1 || !Array.isArray(catalog.packages)) {
      throw new Error('Invalid published dossier package catalog.');
    }
    const loaded = [];
    for (const entry of catalog.packages) {
      if (!entry || typeof entry.file !== 'string' || !/^[\p{L}\p{N}._-]+\.axyp\.(?:zip|pack\.json)$/u.test(entry.file)) {
        throw new Error('Invalid dossier package filename in catalog.');
      }
      const packageResponse = await fetch(new URL('dossier-packages/' + entry.file, document.baseURI));
      if (!packageResponse.ok) throw new Error('Could not load dossier package: ' + entry.file);
      let packageBytes = new Uint8Array(await packageResponse.arrayBuffer());
      if (entry.file.endsWith('.axyp.pack') || entry.file.endsWith('.axyp.pack.json')) {
        if (entry.file.endsWith('.axyp.pack.json')) {
          const descriptor = JSON.parse(strFromU8(packageBytes));
          if (descriptor.encoding !== 'base64-chunks' || !Array.isArray(descriptor.parts) || descriptor.parts.length < 1 || descriptor.parts.length > 10) {
            throw new Error('Invalid compressed package descriptor: ' + entry.file);
          }
          const encodedParts = [];
          for (const partName of descriptor.parts) {
            if (typeof partName !== 'string' || !/^[\p{L}\p{N}._-]+\.b64$/u.test(partName)) {
              throw new Error('Invalid compressed package part filename: ' + entry.file);
            }
            const partResponse = await fetch(new URL('dossier-packages/' + partName, document.baseURI));
            if (!partResponse.ok) throw new Error('Could not load compressed package part: ' + partName);
            encodedParts.push((await partResponse.text()).trim());
          }
          packageBytes = base64ToUint8(encodedParts.join(''));
          if (descriptor.byteLength && packageBytes.length !== descriptor.byteLength) {
            throw new Error('Compressed package byte length mismatch: ' + entry.file);
          }
        }
        const packed = JSON.parse(strFromU8(unzlibSync(packageBytes)));
        if (packed.schemaVersion !== 1 || !Array.isArray(packed.documents) || typeof packed.category !== 'string') {
          throw new Error('Invalid compressed dossier package: ' + entry.file);
        }
        for (const document of packed.documents) {
          if (!document || !document.parts || typeof document.parts !== 'object' || Array.isArray(document.parts)) {
            throw new Error('Invalid compressed document entry: ' + entry.file);
          }
          const parts = {};
          for (const [name, part] of Object.entries(document.parts)) {
            if (!name || name.startsWith('/') || name.includes('..') || !part || typeof part.data !== 'string') {
              throw new Error('Invalid compressed DOCX part: ' + entry.file);
            }
            if (part.encoding === 'utf8') parts[name] = strToU8(part.data);
            else if (part.encoding === 'base64') parts[name] = base64ToUint8(part.data);
            else throw new Error('Unsupported compressed DOCX part encoding: ' + entry.file);
          }
          if (!parts['word/document.xml']) throw new Error('Published DOCX is missing its main document: ' + document.name);
          loaded.push({
            id: String(document.id || entry.id + '-' + loaded.length),
            name: resolvePublishedDocumentName(packed.category, String(document.name || 'Έντυπο Word')),
            category: packed.category,
            categoryLabel: 'Επίσημο πακέτο εφαρμογής',
            source: 'published-package',
            fidelityMode: 'placeholder-only',
            fields: Array.isArray(document.fields) ? document.fields : [],
            mappings: document.mappings && typeof document.mappings === 'object' ? document.mappings : {},
            mappingConfirmedAt: packed.publishedAt || packed.createdAt || 'published',
            files: Object.fromEntries(Object.entries(parts).map(([name, bytes]) => [name, Array.from(bytes)]))
          });
        }
        continue;
      }
      const packageParts = unzipSync(packageBytes);
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
    publishedPackageCatalogLoaded = true;
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

export function migrateLegacyNarcoticsTemplates(storageInstance = storage()) {
  const existing = (() => {
    try { return JSON.parse(storageInstance.getItem(KEY) || '[]'); } catch (_) { return []; }
  })();
  if (!Array.isArray(existing)) throw new Error('Η τοπική βιβλιοθήκη προτύπων δεν έχει έγκυρη μορφή.');
  const retained = existing.filter((template) => !(
    template && template.category === 'narcotics' &&
    (template.builtin === true || /^narcotics-\d{2}$/u.test(String(template.id || '')))
  ));
  const changed = retained.length !== existing.length;
  if (changed) storageInstance.setItem(KEY, JSON.stringify(retained));
  storageInstance.setItem('axyp-narcotics-package-migrated-v2', 'true');
  return changed;
}

async function seedCategory(storageInstance, category) {
  if (category === 'narcotics' && publishedPackageCatalogLoaded) {
    migrateLegacyNarcoticsTemplates(storageInstance);
    storageInstance.setItem(CATEGORY_SEED_KEYS.narcotics, 'true');
    return;
  }
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
  if (typeof window !== 'undefined' && typeof fetch === 'function') await loadPublishedDossierPackages();
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
  { path: 'service.location', label: 'Υπηρεσία · Τόπος' },
  { path: 'service.locationUpper', label: 'Υπηρεσία · Τόπος (κεφαλαία)' },
  { path: 'service.postalCode', label: 'Υπηρεσία · Ταχυδρομικός κώδικας' },
  { path: 'service.commanderFullName', label: 'Υπηρεσία · Ονοματεπώνυμο διοικητή' },
  { path: 'service.commanderRank', label: 'Υπηρεσία · Βαθμός διοικητή' },
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
  { path: 'officerA.fullName', label: 'Α΄ Ανακριτικός · Ονοματεπώνυμο (μορφή έκθεσης)' },
  { path: 'officerA.nominativeFullName', label: 'Α΄ Ανακριτικός · Ονοματεπώνυμο (ονομαστική)' },
  { path: 'officerA.rank', label: 'Α΄ Ανακριτικός · Βαθμός' },
  { path: 'officerA.surname', label: 'Α΄ Ανακριτικός · Επώνυμο' },
  { path: 'officerA.name', label: 'Α΄ Ανακριτικός · Όνομα' },
  { path: 'officerA.service', label: 'Α΄ Ανακριτικός · Υπηρεσία' },
  { path: 'officerA.residence', label: 'Α΄ Ανακριτικός · Κατοικία' },
  { path: 'officerB.fullName', label: 'Β΄ Ανακριτικός · Ονοματεπώνυμο (μορφή έκθεσης)' },
  { path: 'officerB.nominativeFullName', label: 'Β΄ Ανακριτικός · Ονοματεπώνυμο (ονομαστική)' },
  { path: 'officerB.rank', label: 'Β΄ Ανακριτικός · Βαθμός' },
  { path: 'officerB.surname', label: 'Β΄ Ανακριτικός · Επώνυμο' },
  { path: 'officerB.name', label: 'Β΄ Ανακριτικός · Όνομα' },
  { path: 'officerB.service', label: 'Β΄ Ανακριτικός · Υπηρεσία' },
  { path: 'officerB.residence', label: 'Β΄ Ανακριτικός · Κατοικία' },
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
  { path: 'kok.vehicle.registration', label: 'Κ.Ο.Κ. · Όχημα · Αριθμός κυκλοφορίας' },
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

function requiredTemplateFields(template) {
  const fields = Array.isArray(template && template.fields) ? [...template.fields] : [];
  if (template && template.category === 'sudden-death' && template.id === 'sudden-death-03') {
    fields.push('officerB.residence', 'suddenDeath.witness.residence', 'suddenDeath.interpreter.city', 'suddenDeath.event.lastSeenLocation');
  }
  return [...new Set(fields)];
}

export function getMissingTemplateFields(template, item) {
  const fields = requiredTemplateFields(template);
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
  if (field.startsWith('suddenDeath.')) return field;
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

export function getLocalISODate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  const serviceProfile = typeof window !== 'undefined' && window.AXYP_SERVICE_PROFILE && typeof window.AXYP_SERVICE_PROFILE.get === 'function'
    ? window.AXYP_SERVICE_PROFILE.get()
    : {};
  const currentOfficerA = getServiceProfileOperatorIdentity(serviceProfile);
  // A saved case carries the author identity captured when that case was created.
  // Fall back to the installation profile only for legacy cases without a snapshot.
  const officerA = item.officerA && typeof item.officerA === 'object' && Object.keys(item.officerA).length
    ? item.officerA
    : currentOfficerA;
  const officerB = item.officerB || {};
  const officerAFull = officerA.fullName || [officerA.rank, officerA.surname, officerA.name].filter(Boolean).join(' ');
  const officerBFull = [officerB.rank, officerB.surname, officerB.name].filter(Boolean).join(' ');
  const timeline = item.timeline || {};
  const computed = item.profile === 'narcotics' ? computeTimeline(item.time || '') : {};
  const getTime = (key) => timeline[key] || computed[key] || item[key] || '';
  const effectiveDate = String(item.date || getLocalISODate());
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(effectiveDate);
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
  const map = {
    'service.name': serviceProfile.name,
    'service.directorate': serviceProfile.directorate || '',
    'service.address': serviceProfile.address,
    'service.location': serviceProfile.location,
    'service.phone': serviceProfile.phone,
    'service.email': serviceProfile.email,
    'service.prosecutor': serviceProfile.prosecutor,
    'service.chemicalService': serviceProfile.chemicalService,
    'service.locationUpper': serviceProfile.locationUpper || (serviceProfile.location ? String(serviceProfile.location).toLocaleUpperCase('el-GR') : ''),
    'service.postalCode': serviceProfile.postalCode || '',
    'service.regionalDirectorate': serviceProfile.regionalDirectorate || '',
    'service.regionalDirectoratePrefix': serviceProfile.regionalDirectoratePrefix || '',
    'service.commanderFullName': serviceProfile.commanderFullName || '',
    'service.commanderRank': serviceProfile.commanderRank || '',
    'case.title': item.title,
    'case.protocolNumber': item.protocolNumber,
    'case.offence': item.offence,
    'case.status': item.status,
    'case.date': formatDateToGreekNumeric(effectiveDate),
    'case.dateGreek': formatDateToGreekNumeric(effectiveDate),
    'case.date.day': dateParts.day,
    'case.date.monthName': dateParts.month,
    'case.date.year': dateParts.year,
    'case.date.weekdayName': dateParts.weekday,
    'case.releaseDate': formatDateToGreekNumeric(item.releaseDate),
    'case.time': item.time,
'incident.date': formatDateToGreekNumeric((item.incident && item.incident.date) || item.incidentDate || item.date),
  'incident.time': (item.incident && item.incident.time) || item.incidentTime || item.time,
  'incident.location': (item.incident && item.incident.location) || item.incidentLocation || '',
  'case.location': item.location || serviceProfile.location || '',
    'case.prosecutor': item.prosecutor,
    'case.notes': item.notes,
    'case.profile': item.profile,
    'case.people': item.people,
    'case.evidence': item.evidence,
    'case.arrestingOfficer': item.arrestingOfficer,
    'officerA.fullName': officerA.documentFullName || officerA.operatorDocument || toGreekGenitiveFullName(officerAFull),
    'officerA.nominativeFullName': officerA.fullName || officerA.nominativeFullName || officerAFull,
    'officerA.rank': officerA.rank,
    'officerA.surname': officerA.surname,
    'officerA.name': officerA.name,
    'officerA.service': officerA.service || serviceProfile.name || '',
    'officerA.residence': officerA.residence || serviceProfile.name || '',
    'officerB.fullName': officerB.documentFullName || toGreekGenitiveFullName(officerBFull) || serviceProfile.secondOfficerDocument || toGreekGenitiveFullName(serviceProfile.secondOfficer) || '',
    'officerB.nominativeFullName': officerB.fullName || officerBFull || serviceProfile.secondOfficer || '',
    'officerB.rank': officerB.rank,
    'officerB.surname': officerB.surname,
    'officerB.name': officerB.name,
    'officerB.service': officerB.service || serviceProfile.name || '',
    'officerB.residence': officerB.residence || serviceProfile.name || '',
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
    'kok.vehicle.registration': item.categoryData && item.categoryData.kok && item.categoryData.kok.vehicle && item.categoryData.kok.vehicle.registration,
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
    'timeline.witness.startTime': (timeline.witness && timeline.witness.startTime) || getTime('witnessStartTime'),
    'timeline.witness.endTime': (timeline.witness && timeline.witness.endTime) || getTime('witnessEndTime'),
    'timeline.arrest.startTime': (timeline.arrest && timeline.arrest.startTime) || getTime('arrestStartTime'),
    'timeline.arrest.endTime': (timeline.arrest && timeline.arrest.endTime) || getTime('arrestEndTime'),
    'timeline.seizure.startTime': (timeline.seizure && timeline.seizure.startTime) || getTime('seizureStartTime'),
    'timeline.seizure.endTime': (timeline.seizure && timeline.seizure.endTime) || getTime('seizureEndTime'),
    'timeline.notification.startTime': (timeline.notification && timeline.notification.startTime) || getTime('notificationStartTime'),
    'timeline.notification.endTime': (timeline.notification && timeline.notification.endTime) || getTime('notificationEndTime'),
    'timeline.weighing.startTime': (timeline.weighing && timeline.weighing.startTime) || getTime('weighingStartTime'),
    'timeline.weighing.endTime': (timeline.weighing && timeline.weighing.endTime) || getTime('weighingEndTime'),
    'timeline.examination.startTime': (timeline.examination && timeline.examination.startTime) || getTime('examinationStartTime'),
    'timeline.examination.endTime': (timeline.examination && timeline.examination.endTime) || getTime('examinationEndTime'),
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
    'offender.residence': offender.residence || offender.address || offender.city || '',
    'offender.nationalityGenitive': offender.nationalityGenitive || offender.nationality || '',
    'offender.idNumber': offender.idNumber,
    'offender.idDate': formatDateToGreekNumeric(offender.idDate),
    'offender.idService': offender.idService,
    'offender.taxId': offender.taxId,
    'offender.taxOffice': offender.taxOffice,
    'offender.phone': offender.phone,
    'offender.email': offender.email,
    'offender.profession': offender.profession,
    'offender.education': offender.education,
    'offender.maritalStatus': offender.maritalStatus,
    'offender.children': offender.children
  };
  if (path === 'narcotics.service.cityUpper') {
    const city = getDossierFieldValue(item.categoryData, 'narcotics.service.city') || item.location || serviceProfile.location || '';
    return [...String(city).toLocaleUpperCase('el-GR')].join(' ');
  }
  if (path === 'narcotics.service.postalCode') {
    const postalCode = getDossierFieldValue(item.categoryData, path);
    if (postalCode !== '' && postalCode !== undefined && postalCode !== null) {
      return [...String(postalCode).replace(/\\s+/gu, '')].join(' ');
    }
  }
  if (path === 'narcotics.exhibits.cannabis.unit') return 'γραμμαρίων';
  if (path === 'narcotics.exhibits.cigarette.unit') {
    const count = getDossierFieldValue(item.categoryData, 'narcotics.exhibits.cigarette.quantity');
    return Number(count) === 1 ? 'τεμάχιο' : 'τεμάχια';
  }
  const categoryValue = getDossierFieldValue(item.categoryData, path);
  if (categoryValue !== '' && categoryValue !== undefined && categoryValue !== null) {
    if (path === 'narcotics.exhibits.cannabis.quantity') return String(categoryValue).replace('.', ',');
    if (/\.(?:birthDate|idDate|signalReportDate|chemicalProtocolDate)$/u.test(path)) return formatDateToGreekNumeric(String(categoryValue));
    return display(categoryValue);
  }
  return display(map[path]);
}

export function replaceInXml(xml, template, item, options = {}) {
  return xml.replace(/\{\{\s*([\p{L}\p{N}_.-]+)\s*\}\}/gu, (placeholder, path) => {
    const mapped = mappingFor(template, path);
    const raw = mapped ? valueFor(mapped, item) : `{{${path}}}`;
    if (!raw || raw === '—') {
      const required = new Set(Array.isArray(template.fields) ? template.fields : []);
      const optionalMappedPlaceholder = Boolean(mapped) && !required.has(path) && !required.has(mapped);
      return options.preserveMissing && !optionalMappedPlaceholder ? placeholder : '';
    }
    const lines = String(raw).split(/\r?\n/);
    return lines.map((line) => esc(line)).join('</w:t><w:br/><w:t xml:space="preserve">');
  });
}

function renderMappingHistory(card, template) {
  const root = card.querySelector('.template-mapping-history');
  if (!root) return;
  root.textContent = '';
  const versions = listTemplateMappingVersions(template, storage());
  const heading = document.createElement('strong');
  heading.textContent = 'Ιστορικό αντιστοιχίσεων';
  root.appendChild(heading);
  if (!versions.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Δεν υπάρχουν ακόμη αποθηκευμένες εκδόσεις.';
    root.appendChild(empty);
    return;
  }
  versions.slice().reverse().forEach((version) => {
    const row = document.createElement('div');
    row.className = 'template-history-row';
    const label = document.createElement('span');
    label.textContent = 'Έκδοση ' + version.version + ' · ' + new Date(version.savedAt).toLocaleString('el-GR');
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'mini-button';
    restore.textContent = 'Επαναφορά';
    restore.addEventListener('click', () => {
      if (!window.confirm('Να επανέλθει η αντιστοίχιση της έκδοσης ' + version.version + '; Η τρέχουσα έκδοση θα παραμείνει στο ιστορικό.')) return;
      try {
        const mappings = restoreTemplateMappingVersion(template, version.version, storage());
        const all = read();
        const index = all.findIndex((item) => (template.id ? item.id === template.id : item.name === template.name));
        if (index < 0) throw new Error('Το τοπικό πρότυπο δεν βρέθηκε.');
        all[index].mappings = mappings;
        all[index].mappingConfirmedAt = new Date().toISOString();
        write(all);
        saveTemplateMappingVersion(template, mappings, storage(), { label: 'Επαναφορά έκδοσης ' + version.version });
        render();
      } catch (error) {
        window.alert('Δεν ήταν δυνατή η επαναφορά: ' + error.message);
      }
    });
    row.append(label, restore);
    root.appendChild(row);
  });
}


function openTemplateDocumentEditor(template) {
  if (!window.AXYP_ROLE || !window.AXYP_ROLE.isAdmin()) {
    window.alert('Η επεξεργασία προτύπων είναι διαθέσιμη μόνο στον διαχειριστή.');
    return;
  }

  const originalParts = getTemplateParts(template);
  if (!originalParts['word/document.xml']) {
    window.alert('Το πρότυπο δεν περιέχει έγκυρο κύριο έγγραφο Word.');
    return;
  }
  const runs = extractTemplateTextRuns(originalParts);
  if (!runs.length) {
    window.alert('Δεν εντοπίστηκε επεξεργάσιμο κείμενο στο πρότυπο.');
    return;
  }

  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'template-text-editor-title');
  dialog.style.cssText = 'width:min(980px,96vw);max-width:96vw;max-height:92vh;padding:18px;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,.24);overflow:auto;';
  const heading = document.createElement('h2');
  heading.id = 'template-text-editor-title';
  heading.textContent = 'Προεπισκόπηση και επεξεργασία κειμένου';
  const name = document.createElement('p');
  name.textContent = template.name;
  name.className = 'muted';
  const notice = document.createElement('p');
  notice.setAttribute('role', 'note');
  notice.textContent = 'Επεξεργάζεσαι μόνο υπάρχοντα τμήματα κειμένου. Τα placeholders είναι κλειδωμένα και δεν μπορούν να δημιουργηθούν από εδώ. Η δομή πινάκων, οι γραμματοσειρές, η στοίχιση, τα περιθώρια, η διάταξη υπογραφών και τα λοιπά στοιχεία DOCX δεν αλλάζουν. Η προεπισκόπηση δείχνει τη σειρά του κειμένου, όχι την ακριβή σελιδοποίηση του Word.';
  notice.style.cssText = 'padding:10px;background:#f1f5f9;border-radius:8px;line-height:1.5;';
  const preview = document.createElement('div');
  preview.style.cssText = 'border:1px solid #cbd5e1;border-radius:8px;padding:12px;max-height:58vh;overflow:auto;background:#fff;color:#111827;';
  const saveStatus = document.createElement('p');
  saveStatus.setAttribute('role', 'status');
  saveStatus.style.cssText = 'min-height:1.4em;';
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px;';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'mini-button';
  cancel.textContent = 'Ακύρωση';
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'mini-button primary';
  save.textContent = 'Αποθήκευση νέας έκδοσης';
  actions.append(cancel, save);
  dialog.append(heading, name, notice, preview, saveStatus, actions);
  document.body.appendChild(dialog);

  const fileLabels = (path) => {
    if (path === 'word/document.xml') return 'Κύριο σώμα εγγράφου';
    const match = path.match(/^word\/(header|footer)(\d*)\.xml$/u);
    if (match) return (match[1] === 'header' ? 'Κεφαλίδα ' : 'Υποσέλιδο ') + (match[2] || '1');
    if (path === 'word/footnotes.xml') return 'Υποσημειώσεις';
    if (path === 'word/endnotes.xml') return 'Σημειώσεις τέλους';
    if (path === 'word/comments.xml') return 'Σχόλια';
    return path;
  };

  const groupedFiles = new Map();
  for (const run of runs) {
    if (!groupedFiles.has(run.path)) groupedFiles.set(run.path, new Map());
    const paragraphs = groupedFiles.get(run.path);
    if (!paragraphs.has(run.paragraphIndex)) paragraphs.set(run.paragraphIndex, []);
    paragraphs.get(run.paragraphIndex).push(run);
  }

  for (const [path, paragraphs] of groupedFiles) {
    const section = document.createElement('section');
    section.style.cssText = 'margin:0 0 18px;';
    const sectionTitle = document.createElement('h3');
    sectionTitle.textContent = fileLabels(path);
    sectionTitle.style.cssText = 'font-size:1rem;border-bottom:1px solid #cbd5e1;padding-bottom:6px;';
    section.appendChild(sectionTitle);
    for (const [paragraphIndex, paragraphRuns] of paragraphs) {
      const paragraph = document.createElement('p');
      paragraph.style.cssText = 'margin:0 0 9px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere;';
      for (const run of paragraphRuns) {
        if (!run.text) continue;
        if (!run.editable) {
          const locked = document.createElement('code');
          locked.textContent = run.text;
          locked.title = 'Κλειδωμένο placeholder — δεν επεξεργάζεται';
          locked.style.cssText = 'background:#e2e8f0;border-radius:3px;padding:0 2px;color:#334155;';
          paragraph.appendChild(locked);
          continue;
        }
        const input = document.createElement('input');
        input.type = 'text';
        input.value = run.text;
        input.maxLength = 10000;
        input.dataset.path = run.path;
        input.dataset.runIndex = String(run.index);
        input.dataset.originalText = run.text;
        input.setAttribute('aria-label', fileLabels(path) + ', παράγραφος ' + (paragraphIndex + 1) + ', τμήμα ' + (run.index + 1));
        input.spellcheck = false;
        input.style.cssText = 'display:inline-block;vertical-align:baseline;min-width:5ch;max-width:100%;width:' + Math.max(6, Math.min(42, run.text.length + 1)) + 'ch;padding:1px 3px;margin:0;border:1px dashed #94a3b8;border-radius:3px;background:#fffbeb;color:inherit;font:inherit;';
        input.addEventListener('input', () => {
          input.style.width = Math.max(6, Math.min(42, input.value.length + 1)) + 'ch';
        });
        paragraph.appendChild(input);
      }
      section.appendChild(paragraph);
    }
    preview.appendChild(section);
  }

  const closeDialog = () => {
    try { dialog.close(); } catch (_) {}
    dialog.remove();
  };
  cancel.addEventListener('click', closeDialog);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog();
  });

  save.addEventListener('click', async () => {
    const edits = [...preview.querySelectorAll('input[data-run-index]')].map((input) => ({
      path: input.dataset.path,
      index: Number(input.dataset.runIndex),
      originalText: input.dataset.originalText,
      text: input.value
    })).filter((edit) => edit.text !== edit.originalText);
    if (!edits.length) {
      saveStatus.textContent = 'Δεν υπάρχουν αλλαγές για αποθήκευση.';
      return;
    }
    save.disabled = true;
    saveStatus.textContent = 'Αποθήκευση τοπικής έκδοσης…';
    try {
      const all = read();
      const targetIndex = all.findIndex((entry) => template.id ? entry.id === template.id : entry.name === template.name);
      const active = targetIndex >= 0 ? all[targetIndex] : template;
      const activeParts = getTemplateParts(active);
      const backupTemplate = {
        ...active,
        files: Object.fromEntries(Object.entries(activeParts).map(([partPath, bytes]) => [partPath, Array.from(bytes)]))
      };
      const backup = createTemplateDocumentSnapshot(backupTemplate, { label: 'Πριν από επεξεργασία κειμένου' });
      const updatedParts = applyTemplateTextEdits(activeParts, edits);
      const updatedFields = extractTemplateFieldsFromParts(updatedParts);
      const previousFields = Array.isArray(active.fields) ? active.fields : [];
      const fieldsChanged = previousFields.length !== updatedFields.length || previousFields.some((field, index) => field !== updatedFields[index]);
      const updated = {
        ...active,
        files: Object.fromEntries(Object.entries(updatedParts).map(([partPath, bytes]) => [partPath, Array.from(bytes)])),
        documentXml: new TextDecoder().decode(updatedParts['word/document.xml']),
        fields: updatedFields,
        documentHistory: appendTemplateDocumentSnapshot(active.documentHistory, backup),
        documentRevision: Math.max(1, Number(active.documentRevision) || 1) + 1,
        documentUpdatedAt: new Date().toISOString()
      };
      if (fieldsChanged) {
        updated.mappingConfirmedAt = null;
        updated.mappings = Object.fromEntries(Object.entries(active.mappings || {}).filter(([field]) => updatedFields.includes(field)));
      }
      if (targetIndex >= 0) all[targetIndex] = updated;
      else all.push(updated);
      const storageInstance = storage();
      const saved = storageInstance.setItem(KEY, JSON.stringify(all));
      if (saved === false) throw new Error('Η αποθήκευση απορρίφθηκε λόγω σύγκρουσης με άλλη καρτέλα.');
      if (storageInstance.flush) await storageInstance.flush();
      saveStatus.textContent = 'Η νέα έκδοση αποθηκεύτηκε τοπικά. Το αρχικό πρότυπο παραμένει στο ιστορικό.';
      closeDialog();
      render();
    } catch (error) {
      save.disabled = false;
      saveStatus.textContent = 'Δεν αποθηκεύτηκε καμία αλλαγή.';
      window.alert('Δεν ήταν δυνατή η αποθήκευση του προτύπου: ' + error.message);
    }
  });

  if (typeof dialog.showModal === 'function') dialog.showModal();
  else {
    dialog.setAttribute('open', '');
    dialog.style.position = 'fixed';
    dialog.style.inset = '3vh 2vw';
    dialog.style.zIndex = '10000';
  }
}

function render() {
  const root = $('template-library');
  if (!root) return;
  root.textContent = '';
  const currentCase = getCase();
  const localTemplates = read();
  const allTemplates = mergeTemplateOverrides(PUBLISHED_DOSSIER_TEMPLATES, localTemplates);

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

      const isAdmin = !!(window.AXYP_ROLE && window.AXYP_ROLE.isAdmin());
      if (isAdmin && (template.files || template.dataBase64)) {
        const editDocument = document.createElement('button');
        editDocument.type = 'button';
        editDocument.className = 'mini-button';
        editDocument.textContent = 'Προεπισκόπηση / επεξεργασία κειμένου';
        editDocument.addEventListener('click', () => openTemplateDocumentEditor(template));
        card.querySelector('.template-review-actions').insertBefore(editDocument, card.querySelector('.template-review-actions').querySelector('.save-mapping'));
      }
      if (template.source === 'published-package' || !isAdmin) {
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
          try {
            saveTemplateMappingVersion(template, mappings, storage(), { label: 'Αποθήκευση αντιστοίχισης από τον διαχειριστή' });
          } catch (historyError) {
            console.error('Template mapping history could not be saved:', historyError);
          }
        }
        card.querySelector('.mapping-result').textContent = 'Η αντιστοίχιση επιβεβαιώθηκε.';
        card.querySelector('.generate').disabled = false;
        renderMappingHistory(card, template);
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
      if (window.AXYP_ROLE && window.AXYP_ROLE.isAdmin()) {
        const documentHistory = document.createElement('section');
        documentHistory.className = 'template-mapping-history';
        documentHistory.setAttribute('aria-label', 'Ιστορικό εκδόσεων εντύπου Word');
        const historyTitle = document.createElement('strong');
        historyTitle.textContent = 'Ιστορικό εκδόσεων εντύπου';
        documentHistory.appendChild(historyTitle);
        const versions = Array.isArray(template.documentHistory) ? template.documentHistory : [];
        if (!versions.length) {
          const empty = document.createElement('p');
          empty.className = 'muted';
          empty.textContent = 'Δεν υπάρχουν προηγούμενες εκδόσεις του εντύπου.';
          documentHistory.appendChild(empty);
        } else {
          versions.slice().reverse().forEach((version, reverseIndex) => {
            const originalIndex = versions.length - 1 - reverseIndex;
            const row = document.createElement('div');
            row.className = 'template-history-row';
            const label = document.createElement('span');
            label.textContent = 'Προηγούμενη έκδοση ' + (originalIndex + 1) + ' · ' + new Date(version.savedAt).toLocaleString('el-GR') + (version.label ? ' · ' + version.label : '');
            const restoreButton = document.createElement('button');
            restoreButton.type = 'button';
            restoreButton.className = 'mini-button';
            restoreButton.textContent = 'Επαναφορά';
            restoreButton.addEventListener('click', async () => {
              if (!window.confirm('Να επανέλθει αυτή η έκδοση του εντύπου; Η τρέχουσα έκδοση θα διατηρηθεί στο ιστορικό.')) return;
              try {
                const all = read();
                const index = all.findIndex((entry) => entry.id === template.id);
                if (index < 0) throw new Error('Το αποθηκευμένο έντυπο δεν βρέθηκε.');
                const active = all[index];
                const activeParts = getTemplateParts(active);
                const backup = createTemplateDocumentSnapshot({
                  ...active,
                  files: Object.fromEntries(Object.entries(activeParts).map(([path, bytes]) => [path, Array.from(bytes)]))
                }, { label: 'Πριν από επαναφορά έκδοσης' });
                const restoredFiles = restoreTemplateDocumentSnapshot(version);
                const restoredParts = Object.fromEntries(Object.entries(restoredFiles).map(([path, bytes]) => [path, new Uint8Array(bytes)]));
                const restoredFields = extractTemplateFieldsFromParts(restoredParts);
                const oldFields = Array.isArray(active.fields) ? active.fields : [];
                const fieldsChanged = oldFields.length !== restoredFields.length || oldFields.some((field, fieldIndex) => field !== restoredFields[fieldIndex]);
                all[index] = {
                  ...active,
                  files: restoredFiles,
                  fields: restoredFields,
                  documentXml: new TextDecoder().decode(restoredParts['word/document.xml']),
                  documentHistory: appendTemplateDocumentSnapshot(active.documentHistory, backup),
                  documentRevision: Math.max(1, Number(active.documentRevision) || 1) + 1,
                  documentUpdatedAt: new Date().toISOString()
                };
                if (fieldsChanged) {
                  all[index].mappingConfirmedAt = null;
                  all[index].mappings = Object.fromEntries(Object.entries(active.mappings || {}).filter(([field]) => restoredFields.includes(field)));
                }
                const saved = storage().setItem(KEY, JSON.stringify(all));
                if (saved === false) throw new Error('Η αποθήκευση απορρίφθηκε λόγω σύγκρουσης με άλλη καρτέλα.');
                if (storage().flush) await storage().flush();
                render();
              } catch (error) {
                window.alert('Δεν ήταν δυνατή η επαναφορά της έκδοσης: ' + error.message);
              }
            });
            row.append(label, restoreButton);
            documentHistory.appendChild(row);
          });
        }
        card.appendChild(documentHistory);
      }
      if (window.AXYP_ROLE && window.AXYP_ROLE.isAdmin() && template.source !== 'published-package') {
        const history = document.createElement('section');
        history.className = 'template-mapping-history';
        history.setAttribute('aria-label', 'Ιστορικό εκδόσεων αντιστοίχισης');
        card.appendChild(history);
        renderMappingHistory(card, template);
      }
      panel.appendChild(card);
    });
  });

  if (!root.children.length) root.textContent = 'Δεν έχει εισαχθεί ακόμη πραγματικό πρότυπο Word.';
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

export function replaceLegacyFixedDateText(xml, item) {
  // Older saved cases may have no date/location. Use the same local installation
  // defaults as placeholder mappings so legacy fixed text cannot remain stale.
  const effectiveItem = { ...item, date: item.date || getLocalISODate() };
  const day = valueFor('case.date.day', effectiveItem);
  const month = valueFor('case.date.monthName', effectiveItem);
  const year = valueFor('case.date.year', effectiveItem);
  const weekday = valueFor('case.date.weekdayName', effectiveItem);
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(effectiveItem.date || ''));
  if (!dateMatch || !day || !month || !year || !weekday) return xml;

  const location = esc(valueFor('case.location', effectiveItem) || 'έδρα της Υπηρεσίας');
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
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/><w:tblBorders>${nil}</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4680"/><w:gridCol w:w="4680"/></w:tblGrid><w:tr>${cell('Ο Συλλαβών','case.arrestingOfficer')}${cell('Ο Συλληφθείς','person.fullName')}</w:tr><w:tr>${cell('Ο Β΄ Ανακριτικός Υπάλληλος','officerB.fullName')}${cell('Ο Α΄ Ανακριτικός Υπάλληλος','officerA.nominativeFullName')}</w:tr></w:tbl>`;
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
    if (!filename.startsWith('word/') || !(filename.endsWith('.xml') || filename.endsWith('.rels'))) return;
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
    const safeId = String(template.id || index + 1).replace(/[^\p{L}\p{N}-]+/gu, '-').slice(0, 48) || String(index + 1);
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
      .replace(/^[.-]+/u, '')
      .replace(/\.docx$/iu, '') || `entypo-${index + 1}`;
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
    window.TemplateLibrary = { refresh: render, ensureDefaultTemplates, initializeDefaultTemplates, generate, getTemplateParts, getMissingTemplateFields, buildCategoryArchive, buildOfficialDossierPackage, templatesForCategoryGeneration, getCategoryTemplates: (category) => mergeTemplateOverrides(PUBLISHED_DOSSIER_TEMPLATES, read()).filter((template) => template && template.category === category), ready };
  }
}
