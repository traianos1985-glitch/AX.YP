export const SERVICE_PROFILE_STORAGE_KEY = 'axyp-service-profile-v1';
const KEY = SERVICE_PROFILE_STORAGE_KEY;
export const SERVICE_PROFILE_FIELDS = Object.freeze(['name', 'directorate', 'address', 'phone', 'email', 'prosecutor', 'chemicalService']);
const clean = (value) => String(value ?? '').trim();

export function readServiceProfile(storageInstance) {
  const empty = () => Object.fromEntries(SERVICE_PROFILE_FIELDS.map((field) => [field, '']));
  if (!storageInstance || typeof storageInstance.getItem !== 'function') return empty();
  try {
    const saved = JSON.parse(storageInstance.getItem(KEY) || '{}');
    return Object.fromEntries(SERVICE_PROFILE_FIELDS.map((field) => [field, clean(saved[field])]));
  } catch (_) { return empty(); }
}

export function getServiceProfileBackupValue(storageInstance) {
  // Store a normalized profile even when this installation has never saved one.
  // A full restore must not accidentally retain another installation's profile.
  return JSON.stringify(readServiceProfile(storageInstance));
}

export function getServiceProfileRestoreEntry(payload) {
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'serviceProfile') || payload.serviceProfile === null) return null;
  let saved;
  try {
    saved = typeof payload.serviceProfile === 'string' ? JSON.parse(payload.serviceProfile) : payload.serviceProfile;
  } catch (_) {
    throw new Error('Το προφίλ υπηρεσίας στο αντίγραφο ασφαλείας δεν είναι έγκυρο JSON.');
  }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
    throw new Error('Το προφίλ υπηρεσίας στο αντίγραφο ασφαλείας έχει μη έγκυρη μορφή.');
  }
  for (const field of SERVICE_PROFILE_FIELDS) {
    if (saved[field] !== undefined && saved[field] !== null && typeof saved[field] !== 'string') {
      throw new Error('Το πεδίο ' + field + ' στο προφίλ υπηρεσίας έχει μη έγκυρη μορφή.');
    }
  }
  const profile = Object.fromEntries(SERVICE_PROFILE_FIELDS.map((field) => [field, clean(saved[field])]));
  return [KEY, JSON.stringify(profile)];
}

export function writeServiceProfile(storageInstance, values) {
  if (!storageInstance || typeof storageInstance.setItem !== 'function') throw new Error('Η τοπική αποθήκευση δεν είναι διαθέσιμη.');
  const profile = Object.fromEntries(SERVICE_PROFILE_FIELDS.map((field) => [field, clean(values && values[field])]));
  storageInstance.setItem(KEY, JSON.stringify(profile));
  return profile;
}

const storage = () => {
  try { return window.AXYP_STORAGE || window.localStorage; }
  catch (_) { return null; }
};

async function initializeServiceProfile() {
  const form = document.getElementById('service-profile-form');
  if (!form) return;
  const status = document.getElementById('service-profile-status');
  const store = storage();
  if (store && store.ready && typeof store.ready.then === 'function') await store.ready;
  const current = readServiceProfile(store);
  SERVICE_PROFILE_FIELDS.forEach((field) => {
    const input = form.elements.namedItem(field);
    if (input) input.value = current[field];
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const values = Object.fromEntries(SERVICE_PROFILE_FIELDS.map((field) => [field, form.elements.namedItem(field)?.value || '']));
      writeServiceProfile(storage(), values);
      if (status) status.textContent = 'Το προφίλ αποθηκεύτηκε σε αυτή τη συσκευή.';
      window.dispatchEvent(new CustomEvent('axyp:service-profile-updated'));
    } catch (error) {
      if (status) status.textContent = error.message || 'Δεν ήταν δυνατή η αποθήκευση.';
    }
  });
}

if (typeof window !== 'undefined') {
  window.AXYP_SERVICE_PROFILE = { get: () => readServiceProfile(storage()) };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeServiceProfile, { once: true });
    else initializeServiceProfile();
  }
}
