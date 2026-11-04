import { unzipSync, zipSync } from 'fflate';

const KEY = 'axyp-docx-templates';
const $ = (id) => document.getElementById(id);
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; } };
const write = (value) => localStorage.setItem(KEY, JSON.stringify(value));
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]);
const getCase = () => { try { const all = JSON.parse(localStorage.getItem('axyp-hypotheses') || '[]'); return all[0] || {}; } catch (_) { return {}; } };
const fields = (xml) => [...new Set((xml.match(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g) || []).map((value) => value.replace(/\{\{|\}\}|\s/g, '')))];
const display = (value) => value || '—';

function render() {
  const root = $('template-library'); if (!root) return; root.textContent = '';
  read().forEach((template, index) => {
    const card = document.createElement('article'); card.className = 'template-file-card';
    card.innerHTML = '<div><strong></strong><p class="muted"></p></div><div class="template-file-actions"><button type="button" class="mini-button generate">Συμπλήρωση Word</button><button type="button" class="text-button remove">Διαγραφή</button></div>';
    card.querySelector('strong').textContent = template.name;
    card.querySelector('p').textContent = `${template.fields.length} placeholders: ${template.fields.join(', ') || 'κανένα'}`;
    card.querySelector('.generate').onclick = () => generate(template);
    card.querySelector('.remove').onclick = () => { const all = read(); all.splice(index, 1); write(all); render(); };
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
  files['word/document.xml'] = new TextEncoder().encode(xml.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, path) => esc(valueFor(path, item))));
  const blob = new Blob([zipSync(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${item.title || 'ypothesi'}-${template.name}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('template-file')?.addEventListener('change', importTemplate); render();
