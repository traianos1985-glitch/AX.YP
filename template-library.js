import { unzipSync, zipSync } from 'fflate';

const KEY = 'axyp-docx-templates';
const $ = (id) => document.getElementById(id);
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } };
const write = (value) => localStorage.setItem(KEY, JSON.stringify(value));
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]);
const getCase = () => { try { const all = JSON.parse(localStorage.getItem('axyp-hypotheses') || '[]'); return all[0] || {}; } catch (_) { return {}; } };
const fields = (xml) => [...new Set((xml.match(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g) || []).map((value) => value.replace(/\{\{|\}\}|\s/g, '')))];
const display = (value) => value || '—';

const FIELD_OPTIONS = [{ path: 'case.title', label: 'Υπόθεση · τίτλος' }, { path: 'case.offence', label: 'Υπόθεση · είδος αδικήματος' }, { path: 'case.status', label: 'Υπόθεση · κατάσταση' }, { path: 'case.date', label: 'Υπόθεση · ημερομηνία' }, { path: 'case.profile', label: 'Υπόθεση · νομικό προφίλ' }, { path: 'case.people', label: 'Υπόθεση · εμπλεκόμενοι' }, { path: 'case.evidence', label: 'Υπόθεση · ευρήματα/ποσότητες' }, { path: 'case.notes', label: 'Υπόθεση · σημειώσεις' }];
function mappingFor(template, field) { return (template.mappings || {})[field] || (FIELD_OPTIONS.some((option) => option.path === field) ? field : ''); }
function render() {
  const root = $('template-library'); if (!root) return; root.textContent = '';
  read().forEach((template, index) => {
    const card = document.createElement('article'); card.className = 'template-file-card template-review-card';
    card.innerHTML = '<div class="template-review-head"><div><strong></strong><p class="muted"></p></div><button type="button" class="text-button remove">Διαγραφή</button></div><div class="mapping-review"></div><div class="template-review-actions"><span class="mapping-result muted"></span><button type="button" class="mini-button save-mapping">Αποθήκευση αντιστοίχισης</button><button type="button" class="mini-button generate" disabled>Συμπλήρωση Word</button></div>';
    card.querySelector('strong').textContent = template.name;
    card.querySelector('p').textContent = `${template.fields.length} placeholders εντοπίστηκαν — απαιτείται επιβεβαίωση πριν την παραγωγή.`;
    const mappingRoot = card.querySelector('.mapping-review');
    template.fields.forEach((field) => { const row = document.createElement('label'); row.className = 'mapping-row'; row.innerHTML = '<code></code><select><option value="">— Δεν έχει αντιστοιχιστεί —</option></select><output></output>'; row.querySelector('code').textContent = `{{${field}}}`; FIELD_OPTIONS.forEach((option) => { const item = document.createElement('option'); item.value = option.path; item.textContent = option.label; row.querySelector('select').appendChild(item); }); row.querySelector('select').value = mappingFor(template, field); row.querySelector('select').onchange = () => { row.querySelector('output').textContent = display(valueFor(row.querySelector('select').value, getCase())); }; row.querySelector('select').dispatchEvent(new Event('change')); mappingRoot.appendChild(row); });
    card.querySelector('.save-mapping').onclick = () => { const mappings = {}; [...mappingRoot.querySelectorAll('.mapping-row')].forEach((row, rowIndex) => { mappings[template.fields[rowIndex]] = row.querySelector('select').value; }); const all = read(); all[index].mappings = mappings; all[index].mappingConfirmedAt = new Date().toISOString(); write(all); card.querySelector('.mapping-result').textContent = 'Η αντιστοίχιση επιβεβαιώθηκε.'; card.querySelector('.generate').disabled = false; };
    card.querySelector('.generate').onclick = () => generate(read()[index]);
    card.querySelector('.remove').onclick = () => { const all = read(); all.splice(index, 1); write(all); render(); };
    if (template.mappingConfirmedAt) card.querySelector('.generate').disabled = false;
    root.appendChild(card);
  });
  if (!root.children.length) root.textContent = 'Δεν έχει εισαχθεί ακόμη πραγματικό πρότυπο Word.';
}

function importTemplate(event) {
  const file = event.target.files[0]; if (!file) return;
  file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer); const parts = unzipSync(bytes); const documentXml = new TextDecoder().decode(parts['word/document.xml'] || new Uint8Array());
    const templates = read(); templates.push({ id: `${Date.now()}`, name: file.name, fields: fields(documentXml), documentXml, files: Object.fromEntries(Object.entries(parts).map(([name, data]) => [name, Array.from(data)])) }); write(templates); render(); event.target.value = '';
  }).catch(() => { window.alert('Δεν ήταν δυνατή η ανάγνωση του αρχείου Word.'); });
}

function valueFor(path, item) {
  const map = { 'case.title': item.title, 'case.offence': item.offence, 'case.status': item.status, 'case.date': item.date, 'case.notes': item.notes, 'case.profile': item.profile, 'case.people': item.people, 'case.evidence': item.evidence };
  return display(map[path]);
}

function generate(template) {
  const item = getCase(); if (!item.id) { window.alert('Αποθήκευσε πρώτα μια υπόθεση.'); return; }
  const files = Object.fromEntries(Object.entries(template.files).map(([name, data]) => [name, new Uint8Array(data)]));
  const xml = new TextDecoder().decode(files['word/document.xml']);
  files['word/document.xml'] = new TextEncoder().encode(xml.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, path) => { const mappedPath = mappingFor(template, path); return esc(mappedPath ? valueFor(mappedPath, item) : `{{${path}}}`); }));
  const blob = new Blob([zipSync(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${item.title || 'ypothesi'}-${template.name}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('template-file')?.addEventListener('change', importTemplate); render();
