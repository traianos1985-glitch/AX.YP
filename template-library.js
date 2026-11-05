import { unzipSync, zipSync } from './vendor/fflate.js';

const KEY = 'axyp-docx-templates';
const $ = (id) => document.getElementById(id);
const storage = () => window.AXYP_STORAGE || localStorage;
const read = () => { try { return JSON.parse(storage().getItem(KEY) || '[]'); } catch (_) { return []; } };
const write = (value) => storage().setItem(KEY, JSON.stringify(value));
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]);

const getCase = () => {
  try {
    const all = JSON.parse(storage().getItem('axyp-hypotheses') || '[]');
    const activeId = $('case-id')?.value || (window.HypothesesView && window.HypothesesView.getSelectedId && window.HypothesesView.getSelectedId());
    if (!activeId) return null;
    return all.find((item) => item.id === activeId) || null;
  } catch (_) {
    return {};
  }
};

const normalizeDocxXml = (xml) => {
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (p) => {
    return p.replace(/\{\{(?:(?!\{\{|\}\})[\s\S])*?\}\}/g, (match) => {
      if (!match.includes('<')) return match;
      const plain = match.replace(/<[^>]+>/g, '');
      const field = plain.match(/^\s*\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}\s*$/);
      if (field) {
        return `</w:t></w:r><w:r><w:t xml:space="preserve">{{${field[1]}}}</w:t></w:r><w:r><w:t xml:space="preserve">`;
      }
      return match;
    });
  });
};

const extractFields = (xml) => [...new Set((normalizeDocxXml(xml).match(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g) || []).map((val) => val.replace(/\{\{|\}\}|\s/g, '')))];
const display = (value) => value || '—';

export function addMinutes(timeStr, mins) {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return '';
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return '';
  const totalMins = (h * 60 + m + mins) % (24 * 60);
  const normalized = totalMins < 0 ? totalMins + 24 * 60 : totalMins;
  const newH = Math.floor(normalized / 60);
  const newM = normalized % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

export function computeTimeline(baseTime) {
  if (!baseTime) return {};
  const witnessStart = baseTime;
  const witnessEnd = addMinutes(witnessStart, 5);
  const arrestStart = addMinutes(witnessEnd, 1);
  const arrestEnd = addMinutes(arrestStart, 5);
  const seizureStart = addMinutes(arrestEnd, 1);
  const seizureEnd = addMinutes(seizureStart, 5);
  const notificationStart = addMinutes(seizureEnd, 1);
  const notificationEnd = addMinutes(notificationStart, 5);
  const weighingStart = addMinutes(notificationEnd, 1);
  const weighingEnd = addMinutes(weighingStart, 5);
  const examinationStart = addMinutes(weighingEnd, 1);
  const examinationEnd = addMinutes(examinationStart, 5);

  return {
    witnessStartTime: witnessStart,
    witnessEndTime: witnessEnd,
    arrestStartTime: arrestStart,
    arrestEndTime: arrestEnd,
    seizureStartTime: seizureStart,
    seizureEndTime: seizureEnd,
    notificationStartTime: notificationStart,
    notificationEndTime: notificationEnd,
    weighingStartTime: weighingStart,
    weighingEndTime: weighingEnd,
    examinationStartTime: examinationStart,
    examinationEndTime: examinationEnd
  };
}

const FIELD_OPTIONS = [
  { path: 'case.title', label: 'Υπόθεση · Τίτλος' },
  { path: 'case.protocolNumber', label: 'Υπόθεση · Αριθμός Πρωτοκόλλου' },
  { path: 'case.offence', label: 'Υπόθεση · Είδος αδικήματος' },
  { path: 'case.status', label: 'Υπόθεση · Κατάσταση' },
  { path: 'case.date', label: 'Υπόθεση · Ημερομηνία' },
  { path: 'case.time', label: 'Υπόθεση · Ώρα σύνταξης' },
  { path: 'case.location', label: 'Υπόθεση · Τόπος / Πόλη σύνταξης' },
  { path: 'case.prosecutor', label: 'Υπόθεση · Εισαγγελία Πρωτοδικών' },
  { path: 'case.profile', label: 'Υπόθεση · Νομικό προφίλ' },
  { path: 'case.people', label: 'Υπόθεση · Εμπλεκόμενοι / Δράστες' },
  { path: 'case.evidence', label: 'Υπόθεση · Ευρήματα / Ποσότητες' },
  { path: 'case.notes', label: 'Υπόθεση · Σημειώσεις' },
  { path: 'case.arrestingOfficer', label: 'Υπόθεση · Συλλαβών (Στοιχεία/Υπηρεσία)' },
  { path: 'officerA.fullName', label: 'Α΄ Ανακριτικός · Βαθμός & Ονοματεπώνυμο' },
  { path: 'officerA.rank', label: 'Α΄ Ανακριτικός · Βαθμός' },
  { path: 'officerA.surname', label: 'Α΄ Ανακριτικός · Επώνυμο' },
  { path: 'officerA.name', label: 'Α΄ Ανακριτικός · Όνομα' },
  { path: 'officerA.service', label: 'Α΄ Ανακριτικός · Υπηρεσία' },
  { path: 'officerB.fullName', label: 'Β΄ Ανακριτικός · Βαθμός & Ονοματεπώνυμο' },
  { path: 'officerB.rank', label: 'Β΄ Ανακριτικός · Βαθμός' },
  { path: 'officerB.surname', label: 'Β΄ Ανακριτικός · Επώνυμο' },
  { path: 'officerB.name', label: 'Β΄ Ανακριτικός · Όνομα' },
  { path: 'officerB.service', label: 'Β΄ Ανακριτικός · Υπηρεσία' },
  { path: 'person.fullName', label: 'Πρόσωπο · Ονοματεπώνυμο' },
  { path: 'person.surname', label: 'Πρόσωπο · Επώνυμο' },
  { path: 'person.name', label: 'Πρόσωπο · Όνομα' },
  { path: 'person.fatherName', label: 'Πρόσωπο · Πατρώνυμο' },
  { path: 'person.motherName', label: 'Πρόσωπο · Μητρώνυμο' },
  { path: 'person.birthDate', label: 'Πρόσωπο · Ημερομηνία γέννησης' },
  { path: 'person.birthPlace', label: 'Πρόσωπο · Τόπος γέννησης' },
  { path: 'person.city', label: 'Πρόσωπο · Πόλη κατοικίας' },
  { path: 'person.address', label: 'Πρόσωπο · Διεύθυνση κατοικίας' },
  { path: 'person.idNumber', label: 'Πρόσωπο · Αριθμός ταυτότητας' },
  { path: 'person.idDate', label: 'Πρόσωπο · Ημερομηνία έκδοσης ταυτότητας' },
  { path: 'person.idService', label: 'Πρόσωπο · Υπηρεσία έκδοσης' },
  { path: 'person.taxId', label: 'Πρόσωπο · Α.Φ.Μ.' },
  { path: 'person.phone', label: 'Πρόσωπο · Τηλέφωνο' },
  { path: 'person.email', label: 'Πρόσωπο · Email' },
  { path: 'evidence.quantity', label: 'Ευρήματα · Ποσότητες' },
  { path: 'timeline.witness.startTime', label: '1. Κατάθεση · Ώρα έναρξης' },
  { path: 'timeline.witness.endTime', label: "1. Κατάθεση · Ώρα περάτωσης (+5')" },
  { path: 'timeline.arrest.startTime', label: "2. Έκθεση σύλληψης · Ώρα έναρξης (+1')" },
  { path: 'timeline.arrest.endTime', label: "2. Έκθεση σύλληψης · Ώρα περάτωσης (+5')" },
  { path: 'timeline.seizure.startTime', label: "3. Έκθεση κατάσχεσης · Ώρα έναρξης (+1')" },
  { path: 'timeline.seizure.endTime', label: "3. Έκθεση κατάσχεσης · Ώρα περάτωσης (+5')" },
  { path: 'timeline.notification.startTime', label: "4. Έκθεση γνωστοποίησης · Ώρα έναρξης (+1')" },
  { path: 'timeline.notification.endTime', label: "4. Έκθεση γνωστοποίησης · Ώρα περάτωσης (+5')" },
  { path: 'timeline.weighing.startTime', label: "5. Έκθεση ζύγισης · Ώρα έναρξης (+1')" },
  { path: 'timeline.weighing.endTime', label: "5. Έκθεση ζύγισης · Ώρα περάτωσης (+5')" },
  { path: 'timeline.examination.startTime', label: "6. Έκθεση απολογίας · Ώρα έναρξης (+1')" },
  { path: 'timeline.examination.endTime', label: "6. Έκθεση απολογίας · Ώρα περάτωσης (+5')" }
];

function mappingFor(template, field) {
  if (template.mappings && template.mappings[field]) return template.mappings[field];
  if (FIELD_OPTIONS.some((option) => option.path === field)) return field;
  if (field.startsWith('offender.')) {
    const candidate = field.replace('offender.', 'person.');
    if (FIELD_OPTIONS.some((o) => o.path === candidate)) return candidate;
  }
  return '';
}

function valueFor(path, item) {
  if (!item) return '—';
  const offender = item.offender || {};
  const officerA = item.officerA || {};
  const officerB = item.officerB || {};
  const officerAFull = [officerA.rank, officerA.surname, officerA.name].filter(Boolean).join(' ');
  const officerBFull = [officerB.rank, officerB.surname, officerB.name].filter(Boolean).join(' ');
  const timeline = item.timeline || {};
  const computed = computeTimeline(item.time || '');
  const getTime = (key) => timeline[key] || computed[key] || item[key] || '';
  const map = {
    'case.title': item.title,
    'case.protocolNumber': item.protocolNumber,
    'case.offence': item.offence,
    'case.status': item.status,
    'case.date': item.date,
    'case.time': item.time,
    'case.location': item.location,
    'case.prosecutor': item.prosecutor,
    'case.notes': item.notes,
    'case.profile': item.profile,
    'case.people': item.people,
    'case.evidence': item.evidence,
    'case.arrestingOfficer': item.arrestingOfficer,
    'officerA.fullName': officerAFull,
    'officerA.rank': officerA.rank,
    'officerA.surname': officerA.surname,
    'officerA.name': officerA.name,
    'officerA.service': officerA.service,
    'officerB.fullName': officerBFull,
    'officerB.rank': officerB.rank,
    'officerB.surname': officerB.surname,
    'officerB.name': officerB.name,
    'officerB.service': officerB.service,
    'evidence.quantity': item.evidence,
    'timeline.witness.startTime': getTime('witnessStartTime'),
    'timeline.witness.endTime': getTime('witnessEndTime'),
    'timeline.arrest.startTime': getTime('arrestStartTime'),
    'timeline.arrest.endTime': getTime('arrestEndTime'),
    'timeline.seizure.startTime': getTime('seizureStartTime'),
    'timeline.seizure.endTime': getTime('seizureEndTime'),
    'timeline.notification.startTime': getTime('notificationStartTime'),
    'timeline.notification.endTime': getTime('notificationEndTime'),
    'timeline.weighing.startTime': getTime('weighingStartTime'),
    'timeline.weighing.endTime': getTime('weighingEndTime'),
    'timeline.examination.startTime': getTime('examinationStartTime'),
    'timeline.examination.endTime': getTime('examinationEndTime'),
    'case.witnessStartTime': getTime('witnessStartTime'),
    'case.witnessEndTime': getTime('witnessEndTime'),
    'case.arrestStartTime': getTime('arrestStartTime'),
    'case.arrestEndTime': getTime('arrestEndTime'),
    'case.seizureStartTime': getTime('seizureStartTime'),
    'case.seizureEndTime': getTime('seizureEndTime'),
    'case.notificationStartTime': getTime('notificationStartTime'),
    'case.notificationEndTime': getTime('notificationEndTime'),
    'case.weighingStartTime': getTime('weighingStartTime'),
    'case.weighingEndTime': getTime('weighingEndTime'),
    'case.examinationStartTime': getTime('examinationStartTime'),
    'case.examinationEndTime': getTime('examinationEndTime'),
    'person.fullName': [offender.surname, offender.name].filter(Boolean).join(' ') || item.people,
    'person.surname': offender.surname,
    'person.name': offender.name,
    'person.fatherName': offender.fatherName,
    'person.motherName': offender.motherName,
    'person.birthDate': offender.birthDate,
    'person.birthPlace': offender.birthPlace,
    'person.city': offender.city,
    'person.address': offender.address,
    'person.idNumber': offender.idNumber,
    'person.idDate': offender.idDate,
    'person.idService': offender.idService,
    'person.taxId': offender.taxId,
    'person.phone': offender.phone,
    'person.email': offender.email,
    'offender.surname': offender.surname,
    'offender.name': offender.name,
    'offender.fatherName': offender.fatherName,
    'offender.motherName': offender.motherName,
    'offender.birthDate': offender.birthDate,
    'offender.birthPlace': offender.birthPlace,
    'offender.city': offender.city,
    'offender.address': offender.address,
    'offender.idNumber': offender.idNumber,
    'offender.idDate': offender.idDate,
    'offender.idService': offender.idService,
    'offender.taxId': offender.taxId,
    'offender.phone': offender.phone,
    'offender.email': offender.email
  };
  return display(map[path]);
}

function replaceInXml(xml, template, item) {
  return xml.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, path) => {
    const mapped = mappingFor(template, path);
    const raw = mapped ? valueFor(mapped, item) : `{{${path}}}`;
    if (!raw || raw === '—') return '—';
    const lines = String(raw).split(/\r?\n/);
    return lines.map((line) => esc(line)).join('</w:t><w:br/><w:t xml:space="preserve">');
  });
}

function render() {
  const root = $('template-library');
  if (!root) return;
  root.textContent = '';
  const currentCase = getCase();

  read().forEach((template, index) => {
    const card = document.createElement('article');
    card.className = 'template-file-card template-review-card';
    card.innerHTML =
      '<div class="template-review-head"><div><strong></strong><p class="muted"></p></div><button type="button" class="text-button remove">Διαγραφή</button></div>' +
      '<div class="mapping-review"></div>' +
      '<div class="template-review-actions"><span class="mapping-result muted"></span><button type="button" class="mini-button save-mapping">Αποθήκευση αντιστοίχισης</button><button type="button" class="mini-button generate" disabled>Συμπλήρωση Word</button></div>';

    card.querySelector('strong').textContent = template.name;
    const caseNote = currentCase && currentCase.title ? ` (ενεργή υπόθεση: «${currentCase.title}»)` : ' (δεν έχει επιλεγεί υπόθεση)';
    card.querySelector('p').textContent = `${template.fields.length} placeholders εντοπίστηκαν${caseNote}.`;

    const mappingRoot = card.querySelector('.mapping-review');
    template.fields.forEach((field) => {
      const row = document.createElement('label');
      row.className = 'mapping-row';
      row.innerHTML = '<code></code><select><option value="">— Δεν έχει αντιστοιχιστεί —</option></select><output></output>';
      row.querySelector('code').textContent = `{{${field}}}`;

      FIELD_OPTIONS.forEach((option) => {
        const item = document.createElement('option');
        item.value = option.path;
        item.textContent = option.label;
        row.querySelector('select').appendChild(item);
      });

      row.querySelector('select').value = mappingFor(template, field);
      row.querySelector('select').onchange = () => {
        row.querySelector('output').textContent = display(valueFor(row.querySelector('select').value, getCase()));
      };
      row.querySelector('select').dispatchEvent(new Event('change'));
      mappingRoot.appendChild(row);
    });

    card.querySelector('.save-mapping').onclick = () => {
      const mappings = {};
      [...mappingRoot.querySelectorAll('.mapping-row')].forEach((row, rowIndex) => {
        mappings[template.fields[rowIndex]] = row.querySelector('select').value;
      });
      const all = read();
      all[index].mappings = mappings;
      all[index].mappingConfirmedAt = new Date().toISOString();
      write(all);
      card.querySelector('.mapping-result').textContent = 'Η αντιστοίχιση επιβεβαιώθηκε.';
      card.querySelector('.generate').disabled = false;
    };

    card.querySelector('.generate').onclick = () => generate(read()[index]);
    card.querySelector('.remove').onclick = () => {
      if (!window.confirm('Να διαγραφεί το πρότυπο Word;')) return;
      const all = read();
      all.splice(index, 1);
      write(all);
      render();
    };

    if (template.mappingConfirmedAt) card.querySelector('.generate').disabled = false;
    root.appendChild(card);
  });

  if (!root.children.length) root.textContent = 'Δεν έχει εισαχθεί ακόμη πραγματικό πρότυπο Word.';
}

function importTemplate(event) {
  const file = event.target.files[0];
  if (!file) return;
  file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    const parts = unzipSync(bytes);

    // Εντοπισμός placeholders σε όλο το έγγραφο, headers και footers
    const allXml = Object.keys(parts)
      .filter((k) => k.startsWith('word/') && k.endsWith('.xml'))
      .map((k) => new TextDecoder().decode(parts[k] || new Uint8Array()))
      .join('\n');

    const detected = extractFields(allXml);
    const documentXml = new TextDecoder().decode(parts['word/document.xml'] || new Uint8Array());
    const templates = read();
    templates.push({
      id: `${Date.now()}`,
      name: file.name,
      fields: detected,
      documentXml,
      files: Object.fromEntries(Object.entries(parts).map(([name, data]) => [name, Array.from(data)]))
    });
    write(templates);
    render();
    event.target.value = '';
  }).catch(() => {
    window.alert('Δεν ήταν δυνατή η ανάγνωση του αρχείου Word.');
  });
}

async function generate(template) {
  const item = getCase();
  if (!item || !item.id) {
    window.alert('Επίλεξε ρητά την υπόθεση που αφορά το έγγραφο πριν από τη συμπλήρωση.');
    return;
  }
  const files = Object.fromEntries(Object.entries(template.files).map(([name, data]) => [name, new Uint8Array(data)]));

  // Αντικατάσταση placeholders σε document.xml, headers και footers
  Object.keys(files).forEach((filename) => {
    if (filename.startsWith('word/') && filename.endsWith('.xml')) {
      const xml = new TextDecoder().decode(files[filename]);
      files[filename] = new TextEncoder().encode(replaceInXml(xml, template, item));
    }
  });

  const blob = new Blob([zipSync(files)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
  const fileName = (item.title ? item.title.replace(/[\\/:*?"<>|]+/g, '-') : 'ypothesi') + '-' + template.name;
  if (window.AXYP_WORKSPACE && window.AXYP_WORKSPACE.isConnected()) {
    try {
      const persisted = await window.AXYP_WORKSPACE.saveCase(item);
      const allCases = JSON.parse(storage().getItem('axyp-hypotheses') || '[]').map((entry) => entry.id === persisted.id ? persisted : entry);
      storage().setItem('axyp-hypotheses', JSON.stringify(allCases));
      await window.AXYP_WORKSPACE.saveDocument(item.id, fileName, blob);
    } catch (error) {
      window.alert('Το έγγραφο θα ληφθεί, αλλά δεν αποθηκεύτηκε στον φάκελο εργασίας: ' + error.message);
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

if (typeof document !== 'undefined') {
  $('template-file')?.addEventListener('change', importTemplate);
  if (typeof window !== 'undefined') {
    window.TemplateLibrary = { refresh: render };
  }
  render();
}
