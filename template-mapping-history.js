const KEY = 'axyp-template-mapping-history-v1';
const MAX_VERSIONS_PER_TEMPLATE = 30;
const cleanId = (template) => String(template?.id || template?.name || '').trim();
const clone = (value) => JSON.parse(JSON.stringify(value ?? {}));

function readAll(storage) {
  try {
    const value = JSON.parse(storage?.getItem(KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (_) {
    return {};
  }
}

function writeAll(storage, value) {
  if (!storage || typeof storage.setItem !== 'function') throw new Error('Η τοπική αποθήκευση δεν είναι διαθέσιμη.');
  storage.setItem(KEY, JSON.stringify(value));
}

export function listTemplateMappingVersions(template, storage) {
  const id = cleanId(template);
  if (!id) return [];
  const all = readAll(storage);
  return Array.isArray(all[id]) ? clone(all[id]) : [];
}

export function saveTemplateMappingVersion(template, mappings, storage, options = {}) {
  const id = cleanId(template);
  if (!id) throw new Error('Το πρότυπο δεν έχει σταθερό αναγνωριστικό.');
  if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) {
    throw new Error('Η αντιστοίχιση πεδίων δεν έχει έγκυρη μορφή.');
  }
  const all = readAll(storage);
  const versions = Array.isArray(all[id]) ? all[id] : [];
  const entry = {
    version: versions.length ? Math.max(...versions.map((v) => Number(v.version) || 0)) + 1 : 1,
    savedAt: new Date().toISOString(),
    label: String(options.label || 'Αποθήκευση αντιστοίχισης').slice(0, 120),
    mappings: clone(mappings)
  };
  all[id] = [...versions, entry].slice(-MAX_VERSIONS_PER_TEMPLATE);
  writeAll(storage, all);
  return clone(entry);
}

export function restoreTemplateMappingVersion(template, version, storage) {
  const versions = listTemplateMappingVersions(template, storage);
  const entry = versions.find((item) => Number(item.version) === Number(version));
  if (!entry) throw new Error('Η επιλεγμένη έκδοση αντιστοίχισης δεν βρέθηκε.');
  return clone(entry.mappings);
}
