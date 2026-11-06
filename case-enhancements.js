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
    item.location = ($('case-location') ? $('case-location').value.trim() : '');
    item.time = ($('case-time') ? $('case-time').value : '');
    item.prosecutor = ($('case-prosecutor') ? $('case-prosecutor').value.trim() : '');
    item.releaseDate = ($('case-release-date') ? $('case-release-date').value : '');
    item.arrestingOfficer = ($('case-arresting-officer') ? $('case-arresting-officer').value.trim() : '');
    item.officerA = {
      rank: ($('officer-a-rank') ? $('officer-a-rank').value.trim() : ''),
      surname: ($('officer-a-surname') ? $('officer-a-surname').value.trim() : ''),
      name: ($('officer-a-name') ? $('officer-a-name').value.trim() : ''),
      service: ($('officer-a-service') ? $('officer-a-service').value.trim() : '')
    };
    item.officerB = {
      rank: ($('officer-b-rank') ? $('officer-b-rank').value.trim() : ''),
      surname: ($('officer-b-surname') ? $('officer-b-surname').value.trim() : ''),
      name: ($('officer-b-name') ? $('officer-b-name').value.trim() : ''),
      service: ($('officer-b-service') ? $('officer-b-service').value.trim() : '')
    };
    item.timeline = {
      witnessStartTime: ($('timeline-witness-start') ? $('timeline-witness-start').value : ''),
      witnessEndTime: ($('timeline-witness-end') ? $('timeline-witness-end').value : ''),
      arrestStartTime: ($('timeline-arrest-start') ? $('timeline-arrest-start').value : ''),
      arrestEndTime: ($('timeline-arrest-end') ? $('timeline-arrest-end').value : ''),
      seizureStartTime: ($('timeline-seizure-start') ? $('timeline-seizure-start').value : ''),
      seizureEndTime: ($('timeline-seizure-end') ? $('timeline-seizure-end').value : ''),
      notificationStartTime: ($('timeline-notification-start') ? $('timeline-notification-start').value : ''),
      notificationEndTime: ($('timeline-notification-end') ? $('timeline-notification-end').value : ''),
      weighingStartTime: ($('timeline-weighing-start') ? $('timeline-weighing-start').value : ''),
      weighingEndTime: ($('timeline-weighing-end') ? $('timeline-weighing-end').value : ''),
      examinationStartTime: ($('timeline-examination-start') ? $('timeline-examination-start').value : ''),
      examinationEndTime: ($('timeline-examination-end') ? $('timeline-examination-end').value : ''),
      releaseStartTime: ($('timeline-release-time') ? $('timeline-release-time').value : '')
    };
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
      taxOffice: ($('offender-tax-office') ? $('offender-tax-office').value.trim() : ''),
      phone: ($('offender-phone') ? $('offender-phone').value.trim() : ''),
      email: ($('offender-email') ? $('offender-email').value.trim() : '')
    };
    item.owner = {
      fullName: ($('noise-owner-full-name') ? $('noise-owner-full-name').value.trim() : ''),
      fatherName: ($('noise-owner-father-name') ? $('noise-owner-father-name').value.trim() : ''),
      motherName: ($('noise-owner-mother-name') ? $('noise-owner-mother-name').value.trim() : ''),
      birthDate: ($('noise-owner-birth-date') ? $('noise-owner-birth-date').value : ''),
      birthPlace: ($('noise-owner-birth-place') ? $('noise-owner-birth-place').value.trim() : ''),
      city: ($('noise-owner-city') ? $('noise-owner-city').value.trim() : ''),
      idNumber: ($('noise-owner-id-number') ? $('noise-owner-id-number').value.trim() : ''),
      idDate: ($('noise-owner-id-date') ? $('noise-owner-id-date').value : ''),
      idService: ($('noise-owner-id-service') ? $('noise-owner-id-service').value.trim() : ''),
      taxId: ($('noise-owner-tax-id') ? $('noise-owner-tax-id').value.trim() : ''),
      taxOffice: ($('noise-owner-tax-office') ? $('noise-owner-tax-office').value.trim() : '')
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
    if ($('case-profile')) {
      $('case-profile').value = item.profile || 'generic';
      $('case-profile').dispatchEvent(new Event('change', { bubbles: true }));
    }
    if ($('case-people')) $('case-people').value = item.people || '';
    if ($('case-location')) $('case-location').value = item.location || '';
    if ($('case-time')) $('case-time').value = item.time || '';
    if ($('case-prosecutor')) $('case-prosecutor').value = item.prosecutor || '';
    if ($('case-release-date')) $('case-release-date').value = item.releaseDate || '';
    if ($('case-arresting-officer')) $('case-arresting-officer').value = item.arrestingOfficer || '';
    var officerA = item.officerA || {};
    if ($('officer-a-rank')) $('officer-a-rank').value = officerA.rank || '';
    if ($('officer-a-surname')) $('officer-a-surname').value = officerA.surname || '';
    if ($('officer-a-name')) $('officer-a-name').value = officerA.name || '';
    if ($('officer-a-service')) $('officer-a-service').value = officerA.service || '';
    var officerB = item.officerB || {};
    if ($('officer-b-rank')) $('officer-b-rank').value = officerB.rank || '';
    if ($('officer-b-surname')) $('officer-b-surname').value = officerB.surname || '';
    if ($('officer-b-name')) $('officer-b-name').value = officerB.name || '';
    if ($('officer-b-service')) $('officer-b-service').value = officerB.service || '';
    var timeline = item.timeline || {};
    var timeFields = [
      ['timeline-witness-start', timeline.witnessStartTime],
      ['timeline-witness-end', timeline.witnessEndTime],
      ['timeline-arrest-start', timeline.arrestStartTime],
      ['timeline-arrest-end', timeline.arrestEndTime],
      ['timeline-seizure-start', timeline.seizureStartTime],
      ['timeline-seizure-end', timeline.seizureEndTime],
      ['timeline-notification-start', timeline.notificationStartTime],
      ['timeline-notification-end', timeline.notificationEndTime],
      ['timeline-weighing-start', timeline.weighingStartTime],
      ['timeline-weighing-end', timeline.weighingEndTime],
      ['timeline-examination-start', timeline.examinationStartTime],
      ['timeline-examination-end', timeline.examinationEndTime],
      ['timeline-release-time', timeline.releaseStartTime]
    ];
    timeFields.forEach(function (pair) {
      if ($(pair[0]) && pair[1]) $(pair[0]).value = pair[1];
    });
    if ($('case-evidence')) $('case-evidence').value = item.evidence || '';
    var owner = item.owner || {};
    [
      ['noise-owner-full-name', owner.fullName],
      ['noise-owner-father-name', owner.fatherName],
      ['noise-owner-mother-name', owner.motherName],
      ['noise-owner-birth-date', owner.birthDate],
      ['noise-owner-birth-place', owner.birthPlace],
      ['noise-owner-city', owner.city],
      ['noise-owner-id-number', owner.idNumber],
      ['noise-owner-id-date', owner.idDate],
      ['noise-owner-id-service', owner.idService],
      ['noise-owner-tax-id', owner.taxId],
      ['noise-owner-tax-office', owner.taxOffice]
    ].forEach(function (pair) {
      if ($(pair[0])) $(pair[0]).value = pair[1] || '';
    });

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
    var officerA = item.officerA || {};
    var officerB = item.officerB || {};
    var officerAFull = [officerA.rank, officerA.surname, officerA.name].filter(Boolean).join(' ');
    var officerBFull = [officerB.rank, officerB.surname, officerB.name].filter(Boolean).join(' ');
    var rows = [
      ['Αριθμός Πρωτοκόλλου Δικογραφίας', item.protocolNumber || '—'],
      ['Νομικό προφίλ', $('case-profile') ? $('case-profile').selectedOptions[0].textContent : 'Γενική'],
      ['Κατάσταση', item.status || 'Νέα'],
      ['Ημερομηνία', item.date || '—'],
      ['Τόπος / Πόλη σύνταξης', item.location || '—'],
      ['Ώρα σύνταξης', item.time || '—'],
      ['Εισαγγελία Πρωτοδικών', item.prosecutor || '—'],
      ['Α΄ Ανακριτικός Υπάλληλος', officerAFull || '—'],
      ['Υπηρεσία Α΄ Ανακριτικού', officerA.service || '—'],
      ['Β΄ Ανακριτικός Υπάλληλος', officerBFull || '—'],
      ['Υπηρεσία Β΄ Ανακριτικού', officerB.service || '—'],
      ['Συλλαβών αστυνομικός', item.arrestingOfficer || '—'],
      ['1. Κατάθεση (Έναρξη / Περάτωση)', (item.timeline && item.timeline.witnessStartTime ? item.timeline.witnessStartTime + ' – ' + item.timeline.witnessEndTime : '—')],
      ['2. Έκθεση Σύλληψης (Έναρξη / Περάτωση)', (item.timeline && item.timeline.arrestStartTime ? item.timeline.arrestStartTime + ' – ' + item.timeline.arrestEndTime : '—')],
      ['3. Κατάσχεση (Έναρξη / Περάτωση)', (item.timeline && item.timeline.seizureStartTime ? item.timeline.seizureStartTime + ' – ' + item.timeline.seizureEndTime : '—')],
      ['4. Γνωστοποίηση (Έναρξη / Περάτωση)', (item.timeline && item.timeline.notificationStartTime ? item.timeline.notificationStartTime + ' – ' + item.timeline.notificationEndTime : '—')],
      ['5. Έκθεση Ζύγισης (Έναρξη / Περάτωση)', (item.timeline && item.timeline.weighingStartTime ? item.timeline.weighingStartTime + ' – ' + item.timeline.weighingEndTime : '—')],
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

    if (window.AXYP_WORKSPACE && window.AXYP_WORKSPACE.isConnected()) {
      try {
        var persisted = await window.AXYP_WORKSPACE.saveCase(item);
        var allCases = JSON.parse(storage().getItem('axyp-hypotheses') || '[]').map(function (entry) {
          return entry.id === persisted.id ? persisted : entry;
        });
        storage().setItem('axyp-hypotheses', JSON.stringify(allCases));
        item = persisted;
      } catch (error) {
        $('case-flash').textContent = 'Δεν αποθηκεύτηκαν οι τελευταίες αλλαγές στον φάκελο εργασίας: ' + error.message;
        return;
      }
    }
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

  async function downloadArchive() {
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
    var archiveName = safeFileName(item.title) + '.zip';
    if (window.AXYP_WORKSPACE && window.AXYP_WORKSPACE.isConnected()) {
      try {
        await window.AXYP_WORKSPACE.saveDocument(item.id, archiveName, blob);
      } catch (error) {
        $('case-flash').textContent = 'Το ZIP θα ληφθεί, αλλά δεν αποθηκεύτηκε στον φάκελο εργασίας: ' + error.message;
      }
    }
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = archiveName;
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
    if ($('case-profile')) {
      $('case-profile').value = 'generic';
      $('case-profile').dispatchEvent(new Event('change', { bubbles: true }));
    }
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
