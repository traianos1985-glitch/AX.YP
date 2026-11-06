const KEY = 'axyp-service-profile-v1';
export const SERVICE_PROFILE_FIELDS = Object.freeze(['name', 'address', 'phone', 'email', 'prosecutor', 'chemicalService']);
const clean = (value) => String(value ?? '').trim();

export function readServiceProfile(storageInstance) {
  const empty = () => Object.fromEntries(SERVICE_PROFILE_FIELDS.map((field) => [field, '']));
  if (!storageInstance || typeof storageInstance.getItem !== 'function') return empty();
  try {
    const saved = JSON.parse(storageInstance.getItem(KEY) || '{}');
    return Object.fromEntries(SERVICE_PROFILE_FIELDS.map((field) => [field, clean(saved[field])]));
  } catch (_) { return empty(); }
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

function initializeServiceProfile() {
  const form = document.getElementById('service-profile-form');
  if (!form) return;
  const status = document.getElementById('service-profile-status');
  const current = readServiceProfile(storage());
  SERVICE_PROFILE_FIELDS.forEach((field) => {
    const input = form.elements.namedItem(field);
    if (input) input.value = current[field];
  });
  const store = storage();
  if (store && store.ready && typeof store.ready.then === 'function') {
    store.ready.then(() => {
      const hydrated = readServiceProfile(store);
      SERVICE_PROFILE_FIELDS.forEach((field) => {
        const input = form.elements.namedItem(field);
        if (input && !input.value) input.value = hydrated[field];
      });
    });
  }
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
