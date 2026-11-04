(function () {
  var KEY = 'axyp-hypotheses';
  var selectedId = null;
  var storage = window.AXYP_STORAGE || localStorage;
  var $ = function (id) { return document.getElementById(id); };

  function read() {
    try {
      var s = window.AXYP_STORAGE || localStorage;
      return JSON.parse(s.getItem(KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function write(value) {
    var s = window.AXYP_STORAGE || localStorage;
    s.setItem(KEY, JSON.stringify(value));
  }

  function uid() {
    return 'yp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function values() {
    return {
      title: $('case-title').value.trim(),
      offence: $('case-offence').value.trim(),
      status: $('case-status').value,
      date: $('case-date').value,
      protocolNumber: $('case-protocol-number').value.trim(),
      profile: $('case-profile').value,
      people: $('case-people').value.trim(),
      offender: {
        surname: $('offender-surname').value.trim(),
        name: $('offender-name').value.trim(),
        fatherName: $('offender-father-name').value.trim(),
        motherName: $('offender-mother-name').value.trim(),
        birthDate: $('offender-birth-date').value,
        birthPlace: $('offender-birth-place').value.trim(),
        city: $('offender-city').value.trim(),
        address: $('offender-address').value.trim(),
        idNumber: $('offender-id-number').value.trim(),
        idDate: $('offender-id-date').value,
        idService: $('offender-id-service').value.trim(),
        taxId: $('offender-tax-id').value.trim(),
        phone: $('offender-phone').value.trim(),
        email: $('offender-email').value.trim()
      },
      evidence: $('case-evidence').value.trim(),
      notes: $('case-notes').value.trim(),
      completeness: {
        safety: $('check-safety').checked,
        source: $('check-source').checked,
        notify: $('check-notify').checked
      },
      checks: ['check-safety', 'check-source', 'check-notify'].filter(function (id) {
        return $(id) && $(id).checked;
      })
    };
  }

  function reset() {
    $('case-form').reset();
    $('case-id').value = '';
    $('case-date').value = new Date().toISOString().slice(0, 10);
    selectedId = null;
    renderDetail();
  }

  function select(id) {
    selectedId = id;
    var item = read().filter(function (entry) { return entry.id === id; })[0];
    if (!item) return;
    $('case-id').value = item.id;
    $('case-title').value = item.title || '';
    $('case-offence').value = item.offence || '';
    $('case-status').value = item.status || 'Νέα';
    $('case-date').value = item.date || '';
    $('case-protocol-number').value = item.protocolNumber || '';
    $('case-profile').value = item.profile || 'generic';
    $('case-people').value = item.people || '';
    var offender = item.offender || {};
    $('offender-surname').value = offender.surname || '';
    $('offender-name').value = offender.name || '';
    $('offender-father-name').value = offender.fatherName || '';
    $('offender-mother-name').value = offender.motherName || '';
    $('offender-birth-date').value = offender.birthDate || '';
    $('offender-birth-place').value = offender.birthPlace || '';
    $('offender-city').value = offender.city || '';
    $('offender-address').value = offender.address || '';
    $('offender-id-number').value = offender.idNumber || '';
    $('offender-id-date').value = offender.idDate || '';
    $('offender-id-service').value = offender.idService || '';
    $('offender-tax-id').value = offender.taxId || '';
    $('offender-phone').value = offender.phone || '';
    $('offender-email').value = offender.email || '';
    $('case-evidence').value = item.evidence || '';
    $('case-notes').value = item.notes || '';
    $('check-safety').checked = !!(item.completeness && item.completeness.safety);
    $('check-source').checked = !!(item.completeness && item.completeness.source);
    $('check-notify').checked = !!(item.completeness && item.completeness.notify);
    if (window.CaseEnhancements) CaseEnhancements.load();
    render();
  }

  function render() {
    var list = $('cases-list');
    if (!list) return;
    list.textContent = '';
    var items = read();
    if (!items.length) {
      list.appendChild(document.createTextNode('Δεν υπάρχει ακόμη αποθηκευμένη υπόθεση.'));
      return;
    }
    items.forEach(function (item) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'case-card' + (item.id === selectedId ? ' selected' : '');
      card.innerHTML = '<strong></strong><span></span><small></small>';
      card.querySelector('strong').textContent = item.title || 'Χωρίς τίτλο';
      card.querySelector('span').textContent = item.offence || 'Χωρίς κατηγορία';
      card.querySelector('small').textContent = (item.status || 'Νέα') + ' · ' + (item.date || 'χωρίς ημερομηνία');
      card.onclick = function () { select(item.id); };
      list.appendChild(card);
    });
    renderDetail();
  }

  function renderDetail() {
    var item = read().filter(function (entry) { return entry.id === selectedId; })[0];
    $('case-detail-empty').hidden = !!item;
    $('case-detail-content').hidden = !item;
    if (!item) return;
    $('case-detail-title').textContent = (item.title || 'Υπόθεση') + ' · ' + (item.snapshots ? item.snapshots.length : 0) + ' snapshot';
    var root = $('case-snapshots');
    root.textContent = '';
    (item.snapshots || []).slice().reverse().forEach(function (snap) {
      var row = document.createElement('div');
      row.className = 'snapshot';
      row.innerHTML = '<strong></strong><span></span>';
      row.querySelector('strong').textContent = snap.label;
      row.querySelector('span').textContent = new Date(snap.createdAt).toLocaleString('el-GR');
      root.appendChild(row);
    });
  }

  function save(event) {
    event.preventDefault();
    if (window.AXYP_STORAGE && window.AXYP_STORAGE.checkQuota) {
      window.AXYP_STORAGE.checkQuota().then(function (res) {
        if (res.low) {
          $('case-flash').textContent = 'Προσοχή: Ο διαθέσιμος αποθηκευτικός χώρος είναι χαμηλός (' + res.freeMb + ' MB).';
        }
      });
    }
    var items = read();
    var data = values();
    var id = $('case-id').value || uid();
    var existing = items.filter(function (item) { return item.id === id; })[0];
    if (existing) {
      Object.assign(existing, data);
      existing.updatedAt = new Date().toISOString();
    } else {
      items.unshift(Object.assign({ id: id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), snapshots: [] }, data));
    }
    write(items);
    selectedId = id;
    $('case-flash').textContent = 'Η υπόθεση αποθηκεύτηκε τοπικά.';
    render();
  }

  function snapshot() {
    var items = read();
    var item = items.filter(function (entry) { return entry.id === selectedId; })[0];
    if (!item) return;
    if (!item.snapshots) item.snapshots = [];
    item.snapshots.push({
      label: item.title + ' · έκδοση ' + (item.snapshots.length + 1),
      createdAt: new Date().toISOString(),
      data: values()
    });
    item.updatedAt = new Date().toISOString();
    write(items);
    $('case-flash').textContent = 'Το snapshot αποθηκεύτηκε στο ιστορικό.';
    renderDetail();
  }

  function exportData() {
    var blob = new Blob([JSON.stringify({ schema: 1, exportedAt: new Date().toISOString(), hypotheses: read() }, null, 2)], { type: 'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'axyp-ypotheseis.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function downloadJson(name, value) {
    var link = document.createElement('a');
    var blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function fullBackup() {
    var s = window.AXYP_STORAGE || localStorage;
    downloadJson('axyp-plires-antigrafo.json', {
      schema: 2,
      exportedAt: new Date().toISOString(),
      hypotheses: read(),
      favorites: s.getItem('axyp-favorites'),
      profile: s.getItem('axyp-form-profile'),
      theme: s.getItem('axyp-theme'),
      privacy: s.getItem('axyp-privacy'),
      bundles: s.getItem('axyp-case-bundles'),
      templates: s.getItem('axyp-docx-templates'),
      templateMappings: s.getItem('axyp-template-mappings')
    });
    $('case-flash').textContent = 'Το πλήρες αντίγραφο δημιουργήθηκε τοπικά.';
  }

  function restoreBackup(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!parsed || (parsed.schema !== 2 && parsed.schema !== 1) || !Array.isArray(parsed.hypotheses)) {
          throw new Error('invalid schema');
        }

        var shouldMerge = window.confirm(
          'Επαναφορά αντιγράφου:\n\n' +
          '• Πάτησε [OK] για ΣΥΓΧΩΝΕΥΣΗ (διατήρηση των υπαρχουσών υποθέσεων και προσθήκη των νέων).\n' +
          '• Πάτησε [Άκυρο] για επιλογή Πλήρους Αντικατάστασης.'
        );

        var s = window.AXYP_STORAGE || localStorage;
        var currentItems = read();

        if (shouldMerge) {
          // Merge logic: match by ID or append
          var merged = currentItems.slice();
          parsed.hypotheses.forEach(function (incoming) {
            var idx = -1;
            for (var i = 0; i < merged.length; i++) {
              if (merged[i].id === incoming.id) { idx = i; break; }
            }
            if (idx >= 0) {
              merged[idx] = Object.assign({}, merged[idx], incoming);
            } else {
              merged.push(incoming);
            }
          });
          write(merged);

          // Merge bundles
          if (parsed.bundles) {
            try {
              var currBundles = JSON.parse(s.getItem('axyp-case-bundles') || '[]');
              var incBundles = JSON.parse(parsed.bundles);
              if (Array.isArray(incBundles)) {
                incBundles.forEach(function (b) {
                  if (!currBundles.some(function (cb) { return cb.id === b.id; })) {
                    currBundles.push(b);
                  }
                });
                s.setItem('axyp-case-bundles', JSON.stringify(currBundles));
              }
            } catch (_) {}
          }

          // Merge templates
          if (parsed.templates) {
            try {
              var currTemplates = JSON.parse(s.getItem('axyp-docx-templates') || '[]');
              var incTemplates = JSON.parse(parsed.templates);
              if (Array.isArray(incTemplates)) {
                incTemplates.forEach(function (t) {
                  if (!currTemplates.some(function (ct) { return ct.id === t.id; })) {
                    currTemplates.push(t);
                  }
                });
                s.setItem('axyp-docx-templates', JSON.stringify(currTemplates));
              }
            } catch (_) {}
          }

          $('case-flash').textContent = 'Η συγχώνευση αντιγράφου ολοκληρώθηκε επιτυχώς.';
          setTimeout(function () { location.reload(); }, 600);
          return;
        }

        // User chose Cancel -> ask for full overwrite confirmation
        var confirmReplace = window.confirm(
          'ΠΡΟΣΟΧΗ: Επιβεβαιώνεις την ΠΛΗΡΗ ΑΝΤΙΚΑΤΑΣΤΑΣΗ;\n\n' +
          'Όλες οι τρέχουσες τοπικές υποθέσεις θα αντικατασταθούν με τα δεδομένα του αρχείου.'
        );
        if (!confirmReplace) {
          $('case-flash').textContent = 'Η επαναφορά ακυρώθηκε χωρίς αλλαγές.';
          return;
        }

        write(parsed.hypotheses);
        [
          ['axyp-favorites', parsed.favorites],
          ['axyp-form-profile', parsed.profile],
          ['axyp-theme', parsed.theme],
          ['axyp-privacy', parsed.privacy],
          ['axyp-case-bundles', parsed.bundles],
          ['axyp-docx-templates', parsed.templates],
          ['axyp-template-mappings', parsed.templateMappings]
        ].forEach(function (entry) {
          if (entry[1] === null || entry[1] === undefined) {
            s.removeItem(entry[0]);
          } else {
            s.setItem(entry[0], entry[1]);
          }
        });

        $('case-flash').textContent = 'Η πλήρης επαναφορά ολοκληρώθηκε. Ανανεώνεται η εφαρμογή.';
        setTimeout(function () { location.reload(); }, 500);
      } catch (e) {
        $('case-flash').textContent = 'Το αρχείο δεν έχει έγκυρη μορφή αντιγράφου AX.YP.';
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  function importData(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        var list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.hypotheses) ? parsed.hypotheses : null);
        if (!list) throw new Error('invalid format');

        var shouldMerge = window.confirm('Να γίνει συγχώνευση των εισαγόμενων υποθέσεων με τις ήδη υπάρχουσες;');
        if (shouldMerge) {
          var current = read();
          list.forEach(function (item) {
            if (!current.some(function (c) { return c.id === item.id; })) {
              current.push(item);
            }
          });
          write(current);
        } else {
          write(list);
        }
        $('case-flash').textContent = 'Η εισαγωγή ολοκληρώθηκε τοπικά.';
        render();
      } catch (e) {
        $('case-flash').textContent = 'Το αρχείο JSON δεν έχει έγκυρη μορφή υποθέσεων.';
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  window.HypothesesView = {
    refresh: render,
    getSelectedId: function () { return selectedId; }
  };

  $('case-form').addEventListener('submit', save);
  $('case-reset').onclick = reset;
  $('case-snapshot').onclick = snapshot;
  $('case-export').onclick = exportData;
  $('case-import').onchange = importData;
  $('full-backup').onclick = fullBackup;
  $('full-restore').onchange = restoreBackup;
  reset();
  render();
})();
