import { zipSync } from './vendor/fflate.js';

(function () {
  var $ = function (id) { return document.getElementById(id); };

  function storage() {
    return window.AXYP_STORAGE || localStorage;
  }

  function current() {
    var list = [];
    try {
      list = JSON.parse(storage().getItem('axyp-hypotheses') || '[]');
    } catch (e) {}
    var id = $('case-id').value;
    if (!id) return null;
    return list.filter(function (item) { return item.id === id; })[0] || null;
  }

  function selectedChecks() {
    return ['check-safety', 'check-source', 'check-notify'].filter(function (id) {
      var el = $(id);
      return el && el.checked;
    });
  }

  function syncExtraFields() {
    var item = current();
    if (!item) return;
    item.protocolNumber = ($('case-protocol-number') ? $('case-protocol-number').value.trim() : '');
    item.profile = ($('case-profile') ? $('case-profile').value : 'generic');
    item.people = ($('case-people') ? $('case-people').value.trim() : '');
    item.offender = {
      surname: ($('offender-surname') ? $('offender-surname').value.trim() : ''),
      name: ($('offender-name') ? $('offender-name').value.trim() : ''),
      fatherName: ($('offender-father-name') ? $('offender-father-name').value.trim() : ''),
      motherName: ($('offender-mother-name') ? $('offender-mother-name').value.trim() : ''),
      birthDate: ($('offender-birth-date') ? $('offender-birth-date').value : ''),
      birthPlace: ($('offender-birth-place') ? $('offender-birth-place').value.trim() : ''),
      city: ($('offender-city') ? $('offender-city').value.trim() : ''),
      address: ($('offender-address') ? $('offender-address').value.trim() : ''),
      idNumber: ($('offender-id-number') ? $('offender-id-number').value.trim() : ''),
      idDate: ($('offender-id-date') ? $('offender-id-date').value : ''),
      idService: ($('offender-id-service') ? $('offender-id-service').value.trim() : ''),
      taxId: ($('offender-tax-id') ? $('offender-tax-id').value.trim() : ''),
      phone: ($('offender-phone') ? $('offender-phone').value.trim() : ''),
      email: ($('offender-email') ? $('offender-email').value.trim() : '')
    };
    item.evidence = ($('case-evidence') ? $('case-evidence').value.trim() : '');
    item.checks = selectedChecks();
    item.completeness = {
      safety: item.checks.indexOf('check-safety') !== -1,
      source: item.checks.indexOf('check-source') !== -1,
      notify: item.checks.indexOf('check-notify') !== -1
    };
    item.updatedAt = new Date().toISOString();

    var list = JSON.parse(storage().getItem('axyp-hypotheses') || '[]').map(function (entry) {
      return entry.id === item.id ? item : entry;
    });
    storage().setItem('axyp-hypotheses', JSON.stringify(list));
  }

  function loadExtraFields() {
    var item = current();
    if (!item) return;
    if ($('case-profile')) $('case-profile').value = item.profile || 'generic';
    if ($('case-people')) $('case-people').value = item.people || '';
    if ($('case-evidence')) $('case-evidence').value = item.evidence || '';
    var checks = item.checks || [];
    var completeness = item.completeness || {};
    ['check-safety', 'check-source', 'check-notify'].forEach(function (id) {
      var isChecked = checks.indexOf(id) !== -1 ||
        (id === 'check-safety' && completeness.safety) ||
        (id === 'check-source' && completeness.source) ||
        (id === 'check-notify' && completeness.notify);
      if ($(id)) $(id).checked = !!isChecked;
    });
  }

  async function downloadWord() {
    syncExtraFields();
    var item = current();
    if (!item) {
      $('case-flash').textContent = 'Αποθήκευσε πρώτα μια υπόθεση.';
      return;
    }
    var offender = item.offender || {};
    var rows = [
      ['Αριθμός Πρωτοκόλλου Δικογραφίας', item.protocolNumber || '—'],
      ['Νομικό προφίλ', $('case-profile') ? $('case-profile').selectedOptions[0].textContent : 'Γενική'],
      ['Κατάσταση', item.status || 'Νέα'],
      ['Ημερομηνία', item.date || '—'],
      ['Επώνυμο δράστη', offender.surname || '—'],
      ['Όνομα δράστη', offender.name || '—'],
      ['Πατρώνυμο', offender.fatherName || '—'],
      ['Μητρώνυμο', offender.motherName || '—'],
      ['Ημερομηνία γέννησης', offender.birthDate || '—'],
      ['Τόπος γέννησης', offender.birthPlace || '—'],
      ['Πόλη / περιοχή κατοικίας', offender.city || '—'],
      ['Διεύθυνση κατοικίας', offender.address || '—'],
      ['Αριθμός δελτίου ταυτότητας', offender.idNumber || '—'],
      ['Ημερομηνία έκδοσης ταυτότητας', offender.idDate || '—'],
      ['Υπηρεσία έκδοσης', offender.idService || '—'],
      ['Α.Φ.Μ.', offender.taxId || '—'],
      ['Τηλέφωνο', offender.phone || '—'],
      ['Email', offender.email || '—'],
      ['Δράστες / εμπλεκόμενοι', item.people || '—'],
      ['Ευρήματα / ποσότητες', item.evidence || '—'],
      ['Σημειώσεις', item.notes || '—'],
      ['Έλεγχοι πληρότητας', item.checks && item.checks.length === 3 ? 'Ολοκληρώθηκαν' : 'Εκκρεμούν στοιχεία']
    ];

    if (window.DocxExport) {
      await window.DocxExport.download({
        caseId: item.id,
        title: item.title || 'Υπηρεσιακό έγγραφο',
        notice: 'Πρόχειρο εργασίας — απαιτείται υπηρεσιακός έλεγχος πριν από κάθε χρήση.',
        rows: rows,
        source: 'https://proanakrisi.gr/',
        fileName: 'axyp-' + (item.id || 'case') + '.docx'
      });
      $('case-flash').textContent = window.AXYP_WORKSPACE && window.AXYP_WORKSPACE.isConnected() ? 'Το Word αποθηκεύτηκε στα Έγγραφα της δικογραφίας και λήφθηκε.' : 'Το πρόχειρο Word (.docx) κατέβηκε. Επίλεξε προσωπικό φάκελο για να αποθηκεύονται τα έγγραφα και εκεί.';
    }
  }

  // Auto-save on input change removed to prevent writing before clicking "Αποθήκευση".

  function dataUrlBytes(dataUrl) {
    var base64 = String(dataUrl || '').split(',')[1] || '';
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function safeFileName(value) {
    return String(value || 'dikiografia').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'dikiografia';
  }

  function downloadArchive() {
    syncExtraFields();
    var item = current();
    if (!item) {
      $('case-flash').textContent = 'Αποθήκευσε πρώτα μια υπόθεση.';
      return;
    }
    var bundles = [];
    try {
      bundles = JSON.parse(storage().getItem('axyp-case-bundles') || '[]');
    } catch (e) {}
    var bundle = bundles.filter(function (entry) { return entry.id === item.sourceBundleId; })[0];
    var files = {};
    var used = {};
    (bundle && bundle.documents || []).forEach(function (file) {
      var name = safeFileName(file.name);
      var original = name;
      var count = 2;
      while (used[name]) name = original.replace(/(\.[^.]+)?$/, '-' + count++ + '$1');
      used[name] = true;
      files['Έγγραφα/' + name] = dataUrlBytes(file.data);
    });
    files['Στοιχεία-υπόθεσης.json'] = new TextEncoder().encode(JSON.stringify({ exportedAt: new Date().toISOString(), case: item }, null, 2));

    var blob = new Blob([zipSync(files)], { type: 'application/zip' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = safeFileName(item.title) + '.zip';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    $('case-flash').textContent = bundle
      ? 'Ο φάκελος εξήχθη ως ZIP με τα έγγραφα της δικογραφίας.'
      : 'Εξήχθη ZIP με τα στοιχεία της υπόθεσης. Δεν έχει συνδεθεί ακόμη δικογραφία-πρότυπο.';
  }

  $('case-form')?.addEventListener('submit', function () { setTimeout(loadExtraFields, 0); });
  $('case-reset')?.addEventListener('click', function () {
    if ($('case-profile')) $('case-profile').value = 'generic';
    if ($('case-people')) $('case-people').value = '';
    if ($('case-evidence')) $('case-evidence').value = '';
    ['check-safety', 'check-source', 'check-notify'].forEach(function (id) {
      if ($(id)) $(id).checked = false;
    });
  });

  $('case-word')?.addEventListener('click', downloadWord);
  $('case-archive')?.addEventListener('click', downloadArchive);
  window.CaseEnhancements = { load: loadExtraFields, current: current };
})();
