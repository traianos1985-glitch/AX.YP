import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DOSSIER_CATEGORIES } from '../dossier-categories.js';
import { DOSSIER_COMPLETENESS_RULES, evaluateDossierCompleteness } from '../dossier-completeness.js';

const categoryIds = DOSSIER_CATEGORIES.map((category) => category.id);
assert.equal(categoryIds.length, 13);
assert.equal(new Set(categoryIds).size, categoryIds.length);
assert.deepEqual(Object.keys(DOSSIER_COMPLETENESS_RULES).sort(),
  ['camping','commerce','counterfeit','environment','health','narcotics'].sort());

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../case-workflow.js', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

for (const [profile, rule] of Object.entries(DOSSIER_COMPLETENESS_RULES)) {
  assert.ok(rule.label && rule.guidance && rule.groups.length, profile + ' needs a readable checklist');
  const report = evaluateDossierCompleteness(profile, { register: {} }, () => '');
  assert.equal(report.profile, profile);
  assert.equal(report.categoryLabel, rule.label);
  assert.equal(report.hasCategoryChecklist, true);
  assert.ok(report.groups.length);
  for (const group of rule.groups) {
    assert.ok(group.fields.length, profile + ' has an empty checklist group');
    for (const [id, label] of group.fields) {
      assert.ok(label);
      assert.ok(html.includes('id="' + id + '"'), 'Unknown UI field for ' + profile + ': ' + id);
    }
  }
  const filled = evaluateDossierCompleteness(profile, { register: { persons: 2, evidence: 1, actions: 3 } }, () => ' sample ');
  assert.equal(filled.groups.reduce((n, group) => n + group.filled, 0),
    filled.groups.reduce((n, group) => n + group.total, 0));
  assert.deepEqual(filled.register, { persons: 2, evidence: 1, actions: 3 });
}

for (const id of categoryIds.filter((id) => !DOSSIER_COMPLETENESS_RULES[id])) {
  const report = evaluateDossierCompleteness(id, { register: {} }, () => '');
  assert.equal(report.profile, id);
  assert.equal(report.hasCategoryChecklist, false);
  assert.equal(report.groups.length, 0);
  assert.match(report.guidance, /δεν διαθέτει ακόμη ειδικό δομημένο checklist/);
}

const unknown = evaluateDossierCompleteness('unrecognized-profile', { register: { persons: -5, evidence: 'x', actions: 2 } });
assert.equal(unknown.categoryLabel, 'Λοιπές υποθέσεις');
assert.deepEqual(unknown.register, { persons: 0, evidence: 0, actions: 2 });
assert.equal(unknown.groups.length, 0);

// The review is wired into the guided workflow and remains advisory.
assert.match(workflow, /evaluateDossierCompleteness\(profile/);
assert.match(workflow, /Δεν αποτελούν νομικό έλεγχο/);
assert.match(workflow, /δεν χαρακτηρίζουν πεδία ως υποχρεωτικά/);
assert.match(workflow, /δεν εμποδίζουν την αποθήκευση/i);
assert.match(serviceWorker, /\.\/dossier-completeness\.js/);
assert.match(workflow, /import \{ evaluateDossierCompleteness \}/);

console.log('Dossier completeness tests passed: all categories, field IDs, legacy/unknown profiles, safe advisory behavior.');
