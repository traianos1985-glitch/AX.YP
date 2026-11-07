// Central metadata for category-specific fields introduced through the schema-driven form.
// Existing specialist forms remain compatible and are migrated only after their source DOCX
// templates have been inspected and their mappings have been verified.
export const DOSSIER_FIELD_SCHEMA_VERSION = 1;

export const DOSSIER_CATEGORY_FIELDS = Object.freeze({
  narcotics: Object.freeze([]),
  counterfeit: Object.freeze([]),
  environment: Object.freeze([]),
  health: Object.freeze([]),
  noise: Object.freeze([]),
  camping: Object.freeze([]),
  domestic: Object.freeze([]),
  migration: Object.freeze([]),
  traffic: Object.freeze([]),
  kok: Object.freeze([
    Object.freeze({
      path: 'kok.vehicle.registration',
      group: 'Στοιχεία οχήματος',
      label: 'Αριθμός κυκλοφορίας οχήματος',
      type: 'text',
      maxLength: 20,
      placeholder: 'π.χ. ΚΥΑ 1234',
      helpText: 'Καταχώρισε τον αριθμό ακριβώς όπως αναγράφεται στην πινακίδα. Το πεδίο είναι προαιρετικό και διατηρεί αρχικά μηδενικά.',
      required: false,
      role: 'vehicle',
      cardinality: 'single'
    })
  ]),
  animal: Object.freeze([]),
  commerce: Object.freeze([]),
  generic: Object.freeze([])
});

export function getDossierFieldDefinitions(category) {
  return (DOSSIER_CATEGORY_FIELDS[category] || []).map((field) => ({ ...field }));
}

export function getDossierFieldValue(data, path) {
  if (!data || typeof data !== 'object' || typeof path !== 'string') return '';
  return path.split('.').reduce((value, key) => (
    value && typeof value === 'object' ? value[key] : undefined
  ), data) ?? '';
}

export function setDossierFieldValue(data, path, value) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('Τα δεδομένα πεδίων πρέπει να είναι αντικείμενο.');
  }
  if (typeof path !== 'string' || !path.trim()) {
    throw new TypeError('Απαιτείται έγκυρη διαδρομή πεδίου.');
  }
  const parts = path.split('.');
  if (parts.some((part) => !part || ['__proto__', 'prototype', 'constructor'].includes(part))) {
    throw new TypeError('Μη επιτρεπτή διαδρομή πεδίου.');
  }
  let target = data;
  parts.slice(0, -1).forEach((part) => {
    if (!target[part] || typeof target[part] !== 'object' || Array.isArray(target[part])) {
      target[part] = {};
    }
    target = target[part];
  });
  target[parts[parts.length - 1]] = String(value ?? '');
  return data;
}
