import assert from 'node:assert/strict';

class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.className = '';
    this.value = '';
    this.hidden = false;
    this._textContent = '';
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
  set textContent(value) {
    this._textContent = String(value ?? '');
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
  }
  get textContent() { return this._textContent; }
  addEventListener(type, callback) {
    (this.listeners[type] ||= []).push(callback);
  }
  matches(selector) {
    if (selector === '.case-register-entry') return this.className.split(/\s+/).includes('case-register-entry');
    if (selector === '.case-register-empty') return this.className.split(/\s+/).includes('case-register-empty');
    if (selector === '[data-field]') return Object.hasOwn(this.dataset, 'field');
    if (selector === 'button[data-action]') return this.tagName === 'BUTTON' && Object.hasOwn(this.dataset, 'action');
    if (selector === 'button') return this.tagName === 'BUTTON';
    return false;
  }
  querySelectorAll(selector) {
    const found = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }
  dispatch(type, target = this) {
    const event = { type, target, preventDefault() {} };
    let node = this;
    while (node) {
      for (const callback of node.listeners[type] || []) callback(event);
      node = node.parentNode;
    }
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}

const elements = new Map();
const document = {
  createElement: (tag) => new MockElement(tag),
  getElementById: (id) => elements.get(id) || null
};
globalThis.document = document;

const root = new MockElement('div');
elements.set('case-register-root', root);
for (const id of ['person-register-list', 'evidence-register-list', 'task-register-list']) {
  const list = new MockElement('div');
  elements.set(id, list);
  root.appendChild(list);
}
for (const id of ['person-register-add', 'evidence-register-add', 'task-register-add']) {
  const button = new MockElement('button');
  elements.set(id, button);
  root.appendChild(button);
}

globalThis.window = {
  AXYP_SERVICE_PROFILE: {
    get: () => ({ name: 'TEST SERVICE', address: 'TEST ADDRESS', prosecutor: 'TEST PROSECUTOR' })
  }
};

const templateStorage = {
  values: new Map(),
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; },
  setItem(key, value) { this.values.set(key, String(value)); }
};
globalThis.localStorage = templateStorage;

const {
  getCaseRegisterData,
  loadCaseRegister,
  resetCaseRegister
} = await import('../case-register.js');
const { evaluateDossierCompleteness } = await import('../dossier-completeness.js');
const { ensureDefaultTemplates, buildDocx } = await import('../template-library.js');
const { unzipSync } = await import('../vendor/fflate.js');

// Start with a case containing multiple people, evidence items and pending actions.
const initialRegister = {
  persons: [
    { id: 'person-1', role: 'suspect', fullName: 'TEST SUSPECT', idNumber: 'TEST-ID-001', examinationStatus: 'pending' },
    { id: 'person-2', role: 'witness', fullName: 'TEST WITNESS', idNumber: 'TEST-ID-002', examinationStatus: 'completed' }
  ],
  evidence: [
    { id: 'evidence-1', category: 'physical', description: 'TEST MOBILE PHONE', quantity: '1', unit: 'piece', custodyStatus: 'seized' },
    { id: 'evidence-2', category: 'digital', description: 'TEST DIGITAL FILE', quantity: '2', unit: 'files', custodyStatus: 'stored' }
  ],
  actions: [
    { id: 'action-1', type: 'expertise', title: 'TEST LAB EXAMINATION', assignedTo: 'TEST OFFICER', dueDate: '2026-12-01', status: 'pending' }
  ]
};
loadCaseRegister(initialRegister);

let collected = getCaseRegisterData();
assert.equal(collected.persons.length, 2);
assert.equal(collected.evidence.length, 2);
assert.equal(collected.actions.length, 1);
assert.equal(collected.persons[0].fullName, 'TEST SUSPECT');
assert.equal(collected.evidence[1].description, 'TEST DIGITAL FILE');
assert.equal(collected.actions[0].title, 'TEST LAB EXAMINATION');

// Exercise the real add and remove event handlers used by the register UI.
elements.get('person-register-add').dispatch('click');
let personCards = elements.get('person-register-list').querySelectorAll('.case-register-entry');
assert.equal(personCards.length, 3);
const addedPerson = personCards[2];
for (const input of addedPerson.querySelectorAll('[data-field]')) {
  if (input.dataset.field === 'role') input.value = 'witness';
  if (input.dataset.field === 'fullName') input.value = 'TEST ADDED WITNESS';
  if (input.dataset.field === 'idNumber') input.value = 'TEST-ID-003';
}
collected = getCaseRegisterData();
assert.equal(collected.persons.length, 3);
assert.equal(collected.persons[2].fullName, 'TEST ADDED WITNESS');

const removeButton = addedPerson.querySelector('button[data-action]');
assert.ok(removeButton);
removeButton.dispatch('click');
collected = getCaseRegisterData();
assert.equal(collected.persons.length, 2);
assert.ok(!collected.persons.some((person) => person.fullName === 'TEST ADDED WITNESS'));

// Persist the complete case locally, then reconstruct it as if the case was reopened.
const local = new Map();
const caseRecord = {
  id: 'case-lifecycle-001',
  profile: 'narcotics',
  title: 'TEST CASE LIFECYCLE',
  offence: 'TEST OFFENCE',
  protocolNumber: 'TEST-PROTOCOL-001',
  date: '2026-11-06',
  location: 'TEST LOCATION',
  incidentDate: '2026-11-05',
  incidentTime: '21:30',
  evidence: 'TEST EVIDENCE SUMMARY',
  notes: 'TEST CASE NOTES',
  time: '21:30',
  offender: {
    surname: 'TEST SURNAME', name: 'TEST NAME', fatherName: 'TEST FATHER', motherName: 'TEST MOTHER',
    birthDate: '1990-01-01', birthPlace: 'TEST BIRTH PLACE', city: 'TEST CITY', address: 'TEST ADDRESS',
    idNumber: 'TEST-ID-001', idDate: '2015-01-01', idService: 'TEST ISSUING SERVICE'
  },
  officerA: { rank: 'TEST RANK A', surname: 'TEST OFFICER A', name: 'ALPHA', service: 'TEST SERVICE A' },
  officerB: { rank: 'TEST RANK B', surname: 'TEST OFFICER B', name: 'BETA', service: 'TEST SERVICE B' },
  timeline: { witnessStartTime: '21:35', witnessEndTime: '21:40' },
  caseRegister: collected
};
local.set('axyp-hypotheses', JSON.stringify([caseRecord]));
const reopenedCases = JSON.parse(local.get('axyp-hypotheses'));
assert.equal(reopenedCases.length, 1);
assert.equal(reopenedCases[0].caseRegister.persons.length, 2);
loadCaseRegister(reopenedCases[0].caseRegister);
const reopenedRegister = getCaseRegisterData();
assert.deepEqual(JSON.parse(JSON.stringify(reopenedRegister)), JSON.parse(JSON.stringify(collected)));

// The category review must reflect the reopened form values and the actual register counts.
const fieldValues = {
  'case-location': 'TEST LOCATION',
  'case-incident-date': '2026-11-05',
  'case-incident-time': '21:30',
  'offender-surname': 'TEST SURNAME',
  'offender-name': 'TEST NAME',
  'offender-id-number': 'TEST-ID-001',
  'case-evidence': 'TEST EVIDENCE SUMMARY',
  'timeline-witness-start': '21:35',
  'timeline-arrest-start': '21:41',
  'timeline-seizure-start': '21:47',
  'timeline-weighing-start': '21:53'
};
const report = evaluateDossierCompleteness('narcotics', {
  register: {
    persons: reopenedRegister.persons.length,
    evidence: reopenedRegister.evidence.length,
    actions: reopenedRegister.actions.length
  }
}, (id) => fieldValues[id] || '');
assert.equal(report.groups.reduce((sum, group) => sum + group.filled, 0),
  report.groups.reduce((sum, group) => sum + group.total, 0));
assert.deepEqual(report.register, { persons: 2, evidence: 2, actions: 1 });

// Generate a real DOCX from the same reopened case and inspect the resulting ZIP package.
await ensureDefaultTemplates(templateStorage, 'narcotics');
const seededTemplates = JSON.parse(templateStorage.getItem('axyp-docx-templates') || '[]');
const selectedTemplate = seededTemplates.find((template) => template.id === 'narcotics-01');
assert.ok(selectedTemplate, 'The selected built-in narcotics template must be available');
const docx = buildDocx(selectedTemplate, reopenedCases[0]);
assert.ok(docx instanceof Uint8Array);
assert.ok(docx.length > 1000);
const packageFiles = unzipSync(docx);
assert.ok(packageFiles['[Content_Types].xml']);
assert.ok(packageFiles['word/document.xml']);
const documentXml = new TextDecoder().decode(packageFiles['word/document.xml']);
assert.doesNotMatch(documentXml, /\{\{\s*[\p{L}\p{N}_.-]+\s*\}\}/u,
  'The generated Word document must not contain unresolved placeholders');
assert.ok(documentXml.includes('TEST LOCATION') || documentXml.includes('TEST CASE LIFECYCLE'),
  'The generated Word document must contain data from the reopened case');

// Reset must clear only the current case register; the locally persisted case remains untouched.
resetCaseRegister();
const emptyRegister = getCaseRegisterData();
assert.deepEqual(emptyRegister.persons, []);
assert.deepEqual(emptyRegister.evidence, []);
assert.deepEqual(emptyRegister.actions, []);
assert.equal(JSON.parse(local.get('axyp-hypotheses'))[0].caseRegister.persons.length, 2);

// Guard the UI integration points that connect this exercised register flow to case save/reopen/backup.
const { readFile } = await import('node:fs/promises');
const appSource = await readFile(new URL('../hypotheses.js', import.meta.url), 'utf8');
assert.match(appSource, /caseRegister: getCaseRegisterData\(\)/);
assert.match(appSource, /loadCaseRegister\(item\.caseRegister \|\| \{\}\)/);
assert.match(appSource, /resetCaseRegister\(\)/);
assert.match(appSource, /await window\.AXYP_STORAGE\.flush\(\)/);
assert.match(appSource, /hypotheses: read\(\)/,
  'Full backup must include the locally saved case records and their register data');

console.log('Case lifecycle integration tests passed: register UI, local save/reopen, completeness review, DOCX generation and reset.');
