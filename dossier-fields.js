// Central metadata for category-specific fields introduced through the schema-driven form.
const defineDossierField = (path, group, label, type = 'text', required = true, extra = {}) => Object.freeze({
  path, group, label, type, required, cardinality: 'single',
  maxLength: type === 'textarea' ? 3000 : 200,
  ...extra
});

// Existing specialist forms remain compatible and are migrated only after their source DOCX
// templates have been inspected and their mappings have been verified.
export const DOSSIER_FIELD_SCHEMA_VERSION = 1;

export const DOSSIER_CATEGORY_FIELDS = Object.freeze({
  narcotics: Object.freeze([
    defineDossierField('narcotics.policeWitness.fullName', 'Αστυνομικός μάρτυρας', 'Ονοματεπώνυμο αστυνομικού μάρτυρα'),
    defineDossierField('narcotics.policeWitness.fatherNameGenitive', 'Αστυνομικός μάρτυρας', 'Πατρώνυμο (γενική)'),
    defineDossierField('narcotics.policeWitness.motherNameGenitive', 'Αστυνομικός μάρτυρας', 'Μητρώνυμο (γενική)'),
    defineDossierField('narcotics.policeWitness.birthDate', 'Αστυνομικός μάρτυρας', 'Ημερομηνία γέννησης', 'date'),
    defineDossierField('narcotics.policeWitness.birthPlace', 'Αστυνομικός μάρτυρας', 'Τόπος γέννησης'),
    defineDossierField('narcotics.policeWitness.idNumber', 'Αστυνομικός μάρτυρας', 'Αριθμός δελτίου ταυτότητας'),
    defineDossierField('narcotics.policeWitness.idYear', 'Αστυνομικός μάρτυρας', 'Έτος έκδοσης ταυτότητας'),
    defineDossierField('narcotics.policeWitness.profession', 'Αστυνομικός μάρτυρας', 'Ιδιότητα / επάγγελμα'),
    defineDossierField('narcotics.policeWitness.rank', 'Αστυνομικός μάρτυρας', 'Βαθμός'),
    defineDossierField('narcotics.policeWitness.dutyStartTime', 'Αστυνομικός μάρτυρας', 'Ώρα έναρξης διατεταγμένης υπηρεσίας', 'time'),
    defineDossierField('narcotics.policeWitness.dutyEndTime', 'Αστυνομικός μάρτυρας', 'Ώρα λήξης διατεταγμένης υπηρεσίας', 'time'),
    defineDossierField('narcotics.policeWitness.patrolOtherService', 'Αστυνομικός μάρτυρας', 'Άλλη περιοχή / υπηρεσία περιπολίας'),
    defineDossierField('narcotics.apprehendingOfficer.rank', 'Συλλαβών αστυνομικός', 'Βαθμός'),
    defineDossierField('narcotics.apprehendingOfficer.fullName', 'Συλλαβών αστυνομικός', 'Ονοματεπώνυμο'),
    defineDossierField('narcotics.apprehendingOfficer.fatherNameGenitive', 'Συλλαβών αστυνομικός', 'Πατρώνυμο (γενική)'),
    defineDossierField('narcotics.apprehendingOfficer.motherNameGenitive', 'Συλλαβών αστυνομικός', 'Μητρώνυμο (γενική)'),
    defineDossierField('narcotics.apprehendingOfficer.birthDate', 'Συλλαβών αστυνομικός', 'Ημερομηνία γέννησης', 'date'),
    defineDossierField('narcotics.apprehendingOfficer.birthPlace', 'Συλλαβών αστυνομικός', 'Τόπος γέννησης'),
    defineDossierField('narcotics.apprehendingOfficer.city', 'Συλλαβών αστυνομικός', 'Τόπος κατοικίας'),
    defineDossierField('narcotics.apprehendingOfficer.education', 'Συλλαβών αστυνομικός', 'Γραμματικές γνώσεις'),
    defineDossierField('narcotics.apprehendingOfficer.profession', 'Συλλαβών αστυνομικός', 'Επάγγελμα'),
    defineDossierField('narcotics.apprehendingOfficer.idNumber', 'Συλλαβών αστυνομικός', 'Αριθμός δελτίου ταυτότητας'),
    defineDossierField('narcotics.apprehendingOfficer.idDate', 'Συλλαβών αστυνομικός', 'Ημερομηνία έκδοσης ταυτότητας', 'date'),
    defineDossierField('narcotics.apprehendingOfficer.idService', 'Συλλαβών αστυνομικός', 'Αρχή έκδοσης ταυτότητας'),
    defineDossierField('narcotics.apprehendingOfficer.service', 'Συλλαβών αστυνομικός', 'Υπηρεσία'),
    defineDossierField('narcotics.offender.fullNameAccusative', 'Κατηγορούμενος · γραμματικοί τύποι', 'Ονοματεπώνυμο (αιτιατική)'),
    defineDossierField('narcotics.offender.fullNameGenitive', 'Κατηγορούμενος · γραμματικοί τύποι', 'Ονοματεπώνυμο (γενική)'),
    defineDossierField('narcotics.offender.fatherNameGenitive', 'Κατηγορούμενος · γραμματικοί τύποι', 'Πατρώνυμο (γενική)'),
    defineDossierField('narcotics.offender.motherNameGenitive', 'Κατηγορούμενος · γραμματικοί τύποι', 'Μητρώνυμο (γενική)'),
    defineDossierField('narcotics.offender.previousHistory', 'Κατηγορούμενος · δηλώσεις', 'Προηγούμενο ποινικό ιστορικό / απάντηση', 'textarea', true, { rows: 2 }),
    defineDossierField('narcotics.offender.rightsResponse', 'Κατηγορούμενος · δηλώσεις', 'Απάντηση για τη χρήση των δικαιωμάτων', 'textarea', true, { rows: 3 }),
    defineDossierField('narcotics.offender.statement', 'Κατηγορούμενος · δηλώσεις', 'Απολογία / δήλωση κατηγορουμένου', 'textarea', true, { rows: 5 }),
    defineDossierField('narcotics.exhibits.cannabis.quantity', 'Κατασχεθέντα', 'Ποσότητα κάνναβης (γραμμάρια)', 'number', true, { step: '0.01', min: 0 }),
    defineDossierField('narcotics.exhibits.cigarette.quantity', 'Κατασχεθέντα', 'Αριθμός αυτοσχέδιων τσιγάρων (τεμάχια)', 'number', true, { step: '1', min: 0 }),
    defineDossierField('narcotics.policeUnit', 'Υπόθεση · αστυνομική υπηρεσία', 'Αστυνομική ομάδα / υπηρεσία ελέγχου'),
    defineDossierField('narcotics.case.noticeResponse', 'Υπόθεση · γνωστοποίηση', 'Απάντηση για αμφισβήτηση της ιδιότητας των ουσιών'),
    defineDossierField('narcotics.case.releaseTime', 'Υπόθεση · εισαγγελική εντολή', 'Ώρα απόλυσης', 'time'),
    defineDossierField('narcotics.case.chemicalProtocolNumber', 'Υπόθεση · πρωτόκολλα', 'Αριθμός πρωτοκόλλου αποστολής στο Χημείο'),
    defineDossierField('narcotics.prosecutor.surname', 'Υπόθεση · εισαγγελική εντολή', 'Επώνυμο εισαγγελικού λειτουργού'),
    defineDossierField('narcotics.service.commanderFullName', 'Υπηρεσία · πρόσθετα στοιχεία', 'Ονοματεπώνυμο διοικητή'),
    defineDossierField('narcotics.service.postalCode', 'Υπηρεσία · πρόσθετα στοιχεία', 'Ταχυδρομικός κώδικας υπηρεσίας'),
    defineDossierField('narcotics.service.chemicalServiceCity', 'Υπηρεσία · Χημική Υπηρεσία', 'Πόλη Χημικής Υπηρεσίας'),
    defineDossierField('narcotics.service.chemicalServicePostalCode', 'Υπηρεσία · Χημική Υπηρεσία', 'Ταχυδρομικός κώδικας Χημικής Υπηρεσίας')
  ]),
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

// Dormant repeatable-entity support. No controls are rendered while enabled=false.
// These collections remain separate from legacy single-offender and single-vehicle
// fields until real multi-person DOCX examples define their semantics.
export const DOSSIER_REPEATABLE_GROUPS = Object.freeze({
  offenders: Object.freeze({
    path: 'entities.offenders',
    label: 'Δράστες / εμπλεκόμενα πρόσωπα',
    role: 'offender',
    cardinality: 'many',
    enabled: false,
    minItems: 1,
    maxItems: null
  }),
  vehicles: Object.freeze({
    path: 'entities.vehicles',
    label: 'Οχήματα',
    role: 'vehicle',
    cardinality: 'many',
    enabled: false,
    minItems: 0,
    maxItems: null
  })
});

export function getRepeatableGroupDefinition(groupId) {
  const definition = DOSSIER_REPEATABLE_GROUPS[groupId];
  return definition ? { ...definition } : null;
}

export function appendRepeatableEntry(data, groupId, entry) {
  const definition = DOSSIER_REPEATABLE_GROUPS[groupId];
  if (!definition) throw new TypeError('Άγνωστη ομάδα επαναλαμβανόμενων στοιχείων.');
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TypeError('Η εγγραφή πρέπει να είναι αντικείμενο.');
  }
  const current = getDossierFieldValue(data, definition.path);
  if (current !== '' && !Array.isArray(current)) {
    throw new TypeError('Η αποθηκευμένη ομάδα δεν είναι έγκυρη λίστα.');
  }
  const entries = Array.isArray(current) ? current.slice() : [];
  entries.push(JSON.parse(JSON.stringify(entry)));
  setDossierFieldValue(data, definition.path, entries);
  return entries.length;
}

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
  const storedValue = value && typeof value === 'object'
    ? JSON.parse(JSON.stringify(value))
    : String(value ?? '');
  target[parts[parts.length - 1]] = storedValue;
  return data;
}
