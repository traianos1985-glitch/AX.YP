// Δομημένο μητρώο προσώπων, πειστηρίων και εκκρεμών ενεργειών ανά δικογραφία.
// Δεν αντικαθιστά τα legacy πεδία που τροφοδοτούν τα υπάρχοντα πρότυπα Word.
const ROLE_OPTIONS = [
  ['suspect', 'Ύποπτος / κατηγορούμενος'],
  ['victim', 'Παθών / παθούσα'],
  ['witness', 'Μάρτυρας'],
  ['complainant', 'Καταγγέλλων / καταγγέλλουσα'],
  ['owner', 'Ιδιοκτήτης / υπεύθυνος'],
  ['interpreter', 'Διερμηνέας'],
  ['other', 'Άλλος εμπλεκόμενος']
];
const EVIDENCE_OPTIONS = [
  ['physical', 'Υλικό πειστήριο'],
  ['document', 'Έγγραφο'],
  ['digital', 'Ψηφιακό στοιχείο'],
  ['photo_video', 'Φωτογραφία / βίντεο'],
  ['sample', 'Δείγμα'],
  ['other', 'Άλλο']
];
const TASK_OPTIONS = [
  ['document', 'Σύνταξη / αναζήτηση εγγράφου'],
  ['authority', 'Ενημέρωση αρμόδιας αρχής'],
  ['examination', 'Εξέταση προσώπου'],
  ['expertise', 'Εργαστηριακή / τεχνική εξέταση'],
  ['notification', 'Επίδοση / κοινοποίηση'],
  ['other', 'Άλλη ενέργεια']
];
const $ = (id) => document.getElementById(id);
const uid = () => 'rec-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
const clean = (value) => String(value == null ? '' : value).trim();

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function field(labelText, name, type = 'text', options) {
  const label = element('label', 'case-register-field', labelText);
  let input;
  if (options) {
    input = element('select');
    options.forEach(([value, labelText]) => {
      const option = element('option', '', labelText);
      option.value = value;
      input.appendChild(option);
    });
  } else if (type === 'textarea') {
    input = element('textarea');
    input.rows = 2;
  } else {
    input = element('input');
    input.type = type;
  }
  input.dataset.field = name;
  input.autocomplete = 'off';
  label.appendChild(input);
  return label;
}
function entryCard(kind, title, fields, values) {
  const card = element('article', 'case-register-entry');
  card.dataset.kind = kind;
  card.dataset.id = values.id || uid();
  const head = element('div', 'case-register-entry-head');
  head.appendChild(element('strong', '', title));
  const remove = element('button', 'text-button', 'Αφαίρεση');
  remove.type = 'button';
  remove.dataset.action = 'remove';
  head.appendChild(remove);
  card.appendChild(head);
  const grid = element('div', 'case-register-grid');
  fields.forEach((config) => {
    const control = field(config.label, config.name, config.type, config.options);
    const input = control.querySelector('[data-field]');
    input.value = values[config.name] || (config.options ? config.options[0][0] : '');
    grid.appendChild(control);
  });
  card.appendChild(grid);
  return card;
}
function renderList(root, kind, records, title, fields) {
  if (!root) return;
  root.textContent = '';
  if (!records.length) {
    root.appendChild(element('p', 'case-register-empty', 'Δεν έχουν καταχωριστεί στοιχεία.'));
    return;
  }
  records.forEach((record, index) => {
    root.appendChild(entryCard(kind, title + ' ' + (index + 1), fields, record));
  });
}
const PERSON_FIELDS = [
  { label: 'Ρόλος', name: 'role', options: ROLE_OPTIONS },
  { label: 'Ονοματεπώνυμο', name: 'fullName' },
  { label: 'Πατρώνυμο', name: 'fatherName' },
  { label: 'Αριθμός ταυτότητας / διαβατηρίου', name: 'idNumber' },
  { label: 'Διεύθυνση', name: 'address' },
  { label: 'Τηλέφωνο επικοινωνίας', name: 'phone', type: 'tel' },
  { label: 'Κατάσταση εξέτασης', name: 'examinationStatus', options: [['pending','Εκκρεμεί'],['completed','Ολοκληρώθηκε'],['not_required','Δεν απαιτείται']] },
  { label: 'Σημειώσεις', name: 'notes', type: 'textarea' }
];
const EVIDENCE_FIELDS = [
  { label: 'Είδος', name: 'category', options: EVIDENCE_OPTIONS },
  { label: 'Περιγραφή / ονομασία', name: 'description' },
  { label: 'Ποσότητα', name: 'quantity', type: 'number' },
  { label: 'Μονάδα μέτρησης', name: 'unit' },
  { label: 'Σειριακός αριθμός', name: 'serialNumber' },
  { label: 'Αριθμός σφραγίδας / συσκευασίας', name: 'sealNumber' },
  { label: 'Φύλαξη / κατάσταση', name: 'custodyStatus', options: [['unknown','Δεν καταχωρίστηκε'],['seized','Κατασχέθηκε'],['stored','Σε φύλαξη'],['delivered','Παραδόθηκε'],['returned','Αποδόθηκε'],['other','Άλλο']] },
  { label: 'Σημειώσεις / τόπος φύλαξης', name: 'notes', type: 'textarea' }
];
const TASK_FIELDS = [
  { label: 'Ενέργεια', name: 'type', options: TASK_OPTIONS },
  { label: 'Περιγραφή', name: 'title' },
  { label: 'Υπεύθυνος', name: 'assignedTo' },
  { label: 'Προθεσμία', name: 'dueDate', type: 'date' },
  { label: 'Κατάσταση', name: 'status', options: [['pending','Εκκρεμεί'],['in_progress','Σε εξέλιξη'],['completed','Ολοκληρώθηκε'],['not_applicable','Δεν απαιτείται']] },
  { label: 'Σημειώσεις', name: 'notes', type: 'textarea' }
];
let initialized = false;
function init() {
  if (initialized) return;
  const root = $('case-register-root');
  if (!root) return;
  initialized = true;
  root.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const card = button.closest('.case-register-entry');
    if (button.dataset.action === 'remove' && card) {
      card.remove();
      const list = $(card.dataset.kind + '-register-list');
      if (list && !list.querySelector('.case-register-entry')) list.appendChild(element('p', 'case-register-empty', 'Δεν έχουν καταχωριστεί στοιχεία.'));
    }
  });
  [
    ['person-register-add','person-register-list','person',PERSON_FIELDS,'Πρόσωπο'],
    ['evidence-register-add','evidence-register-list','evidence',EVIDENCE_FIELDS,'Πειστήριο'],
    ['task-register-add','task-register-list','task',TASK_FIELDS,'Ενέργεια']
  ].forEach(([buttonId,listId,kind,fields,title]) => {
    const button = $(buttonId);
    if (!button) return;
    button.addEventListener('click', () => {
      const list = $(listId);
      list.querySelector('.case-register-empty')?.remove();
      list.appendChild(entryCard(kind,title,fields,{}));
    });
  });
}
function collect(listId, kind) {
  const root = $(listId);
  if (!root) return [];
  return Array.from(root.querySelectorAll('.case-register-entry')).map((card) => {
    const record = { id: card.dataset.id, kind, updatedAt: new Date().toISOString() };
    card.querySelectorAll('[data-field]').forEach((input) => { record[input.dataset.field] = clean(input.value); });
    return record;
  });
}
export function getCaseRegisterData() {
  init();
  return {
    schemaVersion: 1,
    persons: collect('person-register-list','person'),
    evidence: collect('evidence-register-list','evidence'),
    actions: collect('task-register-list','task')
  };
}
export function loadCaseRegister(data) {
  init();
  const source = data && typeof data === 'object' ? data : {};
  renderList($('person-register-list'),'person',Array.isArray(source.persons) ? source.persons : [],'Πρόσωπο',PERSON_FIELDS);
  renderList($('evidence-register-list'),'evidence',Array.isArray(source.evidence) ? source.evidence : [],'Πειστήριο',EVIDENCE_FIELDS);
  renderList($('task-register-list'),'task',Array.isArray(source.actions) ? source.actions : [],'Ενέργεια',TASK_FIELDS);
}
export function resetCaseRegister() {
  loadCaseRegister({ persons: [], evidence: [], actions: [] });
}
