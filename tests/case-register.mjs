import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeCaseRegister } from '../case-register.js';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../hypotheses.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

const normalized = normalizeCaseRegister({
  persons: [
    { id: 'p-1', role: 'witness', fullName: 'ΜΑΡΙΑ ΔΟΚΙΜΗ', idNumber: 'AB123', notes: 'Μάρτυρας' },
    { id: 'p-2', role: 'not-a-role', fullName: 'Δεύτερο πρόσωπο', examinationStatus: 'invalid' },
    null
  ],
  evidence: [
    { id: 'e-1', category: 'physical', description: 'Κινητό τηλέφωνο', quantity: '1', unit: 'τεμάχιο', custodyStatus: 'seized' },
    { id: 'e-2', category: 'unknown-category', quantity: '-4', notes: 'x'.repeat(2500) }
  ],
  actions: [
    { id: 'a-1', type: 'expertise', title: 'Αποστολή για εξέταση', status: 'pending', dueDate: '2026-12-01' }
  ]
});

assert.equal(normalized.schemaVersion, 1);
assert.equal(normalized.persons.length, 2);
assert.equal(normalized.persons[0].role, 'witness');
assert.equal(normalized.persons[0].fullName, 'ΜΑΡΙΑ ΔΟΚΙΜΗ');
assert.equal(normalized.persons[1].role, 'suspect');
assert.equal(normalized.persons[1].examinationStatus, 'pending');
assert.equal(normalized.evidence[0].quantity, '1');
assert.equal(normalized.evidence[1].category, 'physical');
assert.equal(normalized.evidence[1].quantity, '');
assert.equal(normalized.evidence[1].notes.length, 2000);
assert.equal(normalized.actions[0].status, 'pending');
assert.equal(normalizeCaseRegister({ persons: 'invalid', evidence: null, actions: [] }).persons.length, 0);
assert.equal(normalizeCaseRegister({ persons: Array.from({ length: 130 }, (_, i) => ({ id: String(i) })) }).persons.length, 100);

for (const id of [
  'case-register-section','person-register-add','person-register-list',
  'evidence-register-add','evidence-register-list','task-register-add','task-register-list'
]) assert.match(source, new RegExp('id="' + id + '"'));

assert.match(app, /caseRegister: getCaseRegisterData\(\)/);
assert.match(app, /loadCaseRegister\(item\.caseRegister \|\| \{\}\)/);
assert.match(app, /resetCaseRegister\(\)/);
assert.match(sw, /"\.\/case-register\.js"/);

console.log('Structured dossier register tests passed.');
