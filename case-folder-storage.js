// Κοινόχρηστη αποθήκη δικογραφιών σε πραγματικό φάκελο του υπολογιστή.
// Τα δεδομένα των δικογραφιών γράφονται σε αρχεία JSON και έγγραφα, όχι στο cloud.
(function () {
  'use strict';

  var DB_NAME = 'axyp-case-folder-handles';
  var STORE_NAME = 'handles';
  var HANDLE_KEY = 'shared-root';
  var ROOT_NAME = 'AX.YP';
  var CASES_NAME = 'Δικογραφίες';
  var handle = null;
  var casesHandle = null;
  var statusNode = function () { return document.getElementById('case-folder-status'); };

  function status(message, error) {
    var node = statusNode();
    if (!node) return;
    node.textContent = message;
    node.setAttribute('data-state', error ? 'error' : 'ok');
  }

  function openHandleDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('Το IndexedDB δεν είναι διαθέσιμο.'));
      var request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('Αποτυχία πρόσβασης στις ρυθμίσεις φακέλου.')); };
    });
  }

  async function saveHandle(value) {
    var db = await openHandleDb();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, HANDLE_KEY);
      tx.oncomplete = function () { db.close(); resolve(); };
      tx.onerror = function () { db.close(); reject(tx.error); };
      tx.onabort = function () { db.close(); reject(tx.error || new Error('Η αποθήκευση της σύνδεσης ακυρώθηκε.')); };
    });
  }

  async function readHandle() {
    var db = await openHandleDb();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readonly');
      var request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      request.onsuccess = function () { resolve(request.result || null); };
      request.onerror = function () { reject(request.error); };
      tx.oncomplete = function () { db.close(); };
      tx.onerror = function () { db.close(); };
    });
  }

  async function permission(value, request) {
    if (!value) return false;
    var options = { mode: 'readwrite' };
    var current = await value.queryPermission(options);
    if (current === 'granted') return true;
    if (request && current === 'prompt') return (await value.requestPermission(options)) === 'granted';
    return false;
  }

  function safePart(value) {
    return String(value || '')
      .normalize('NFC')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
      .replace(/[. ]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 90) || 'Χωρίς-τίτλο';
  }

  function folderName(item) {
    var type = safePart(item.offence || item.profile || 'Υπόθεση');
    var protocol = safePart(item.protocolNumber || '');
    if (!item.offence || !item.protocolNumber) {
      throw new Error('Για κοινόχρηστη αποθήκευση συμπλήρωσε είδος υπόθεσης και αριθμό πρωτοκόλλου.');
    }
    return type + '_' + protocol;
  }

  async function readJson(directory, name) {
    try {
      var fileHandle = await directory.getFileHandle(name);
      var file = await fileHandle.getFile();
      return JSON.parse(await file.text());
    } catch (error) {
      if (error && error.name === 'NotFoundError') return null;
      throw error;
    }
  }

  async function writeBlob(directory, name, blob) {
    var fileHandle = await directory.getFileHandle(name, { create: true });
    var writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  function dataUrlToBlob(dataUrl, type) {
    var parts = String(dataUrl || '').split(',');
    if (parts.length < 2) throw new Error('Μη έγκυρο αρχείο συνημμένου.');
    var binary = atob(parts[1]);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: type || 'application/octet-stream' });
  }

  async function copyBundleDocuments(item, directory) {
    if (!item.sourceBundleId || !window.AXYP_STORAGE) return;
    var bundles = [];
    try { bundles = JSON.parse(window.AXYP_STORAGE.getItem('axyp-case-bundles') || '[]'); } catch (_) {}
    var bundle = bundles.find(function (entry) { return entry.id === item.sourceBundleId; });
    if (!bundle || !Array.isArray(bundle.documents)) return;
    var documents = await directory.getDirectoryHandle('Έγγραφα', { create: true });
    for (var i = 0; i < bundle.documents.length; i++) {
      var doc = bundle.documents[i];
      if (!doc || !doc.data || !doc.name) continue;
      await writeBlob(documents, safePart(doc.name), dataUrlToBlob(doc.data, doc.type));
    }
  }

  async function loadAll() {
    if (!casesHandle) return [];
    var results = [];
    for await (var entry of casesHandle.values()) {
      if (entry.kind !== 'directory') continue;
      var record = await readJson(entry, 'case.json');
      if (record && record.id) {
        record.folderName = entry.name;
        results.push(record);
      }
    }
    results.sort(function (a, b) {
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
    return results;
  }

  async function saveCase(item) {
    if (!casesHandle || !(await permission(handle, false))) {
      throw new Error('Ο κοινόχρηστος φάκελος δεν είναι διαθέσιμος. Πάτησε «Σύνδεση φακέλου» και επίλεξε ξανά τη θέση του AX.YP.');
    }
    var name = folderName(item);
    var directory = await casesHandle.getDirectoryHandle(name, { create: true });
    var existing = await readJson(directory, 'case.json');
    if (existing && existing.id !== item.id) {
      throw new Error('Υπάρχει ήδη διαφορετική δικογραφία με το ίδιο είδος και αριθμό πρωτοκόλλου. Δεν έγινε αντικατάσταση.');
    }
    var currentRevision = existing ? Number(existing.storageRevision || 0) : 0;
    var localRevision = Number(item.storageRevision || 0);
    if (existing && currentRevision !== localRevision) {
      throw new Error('Εντοπίστηκε νεότερη έκδοση της δικογραφίας από άλλον χρήστη ή browser. Δεν έγινε αντικατάσταση· ανανέωσε τη λίστα και φόρτωσε την τελευταία έκδοση.');
    }
    if (!existing && localRevision > 0) {
      throw new Error('Ο φάκελος της δικογραφίας δεν βρέθηκε. Για προστασία των δεδομένων δεν έγινε νέα εγγραφή.');
    }
    var saved = Object.assign({}, item, {
      folderName: name,
      storageRevision: currentRevision + 1,
      updatedAt: new Date().toISOString()
    });
    await writeBlob(directory, 'case.json', new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' }));
    await directory.getDirectoryHandle('Έγγραφα', { create: true });
    await copyBundleDocuments(saved, directory);
    return saved;
  }

  async function saveDocument(caseId, fileName, blob) {
    if (!casesHandle || !(await permission(handle, false))) throw new Error('Δεν υπάρχει ενεργή σύνδεση με τον κοινόχρηστο φάκελο.');
    var all = await loadAll();
    var item = all.find(function (entry) { return entry.id === caseId; });
    if (!item || !item.folderName) throw new Error('Δεν βρέθηκε ο φάκελος της επιλεγμένης δικογραφίας.');
    var directory = await casesHandle.getDirectoryHandle(item.folderName);
    var documents = await directory.getDirectoryHandle('Έγγραφα', { create: true });
    await writeBlob(documents, safePart(fileName), blob);
  }

  async function importLocalCases() {
    var storage = window.AXYP_STORAGE || localStorage;
    var local = [];
    try { local = JSON.parse(storage.getItem('axyp-hypotheses') || '[]'); } catch (_) {}
    var existing = await loadAll();
    var known = new Set(existing.map(function (item) { return item.id; }));
    var skipped = 0;
    for (var i = 0; i < local.length; i++) {
      if (known.has(local[i].id)) continue;
      try {
        if (!local[i].offence || !local[i].protocolNumber) { skipped++; continue; }
        var saved = await saveCase(local[i]);
        existing.push(saved);
        known.add(saved.id);
      } catch (error) {
        if (error && /ίδιο είδος και αριθμό πρωτοκόλλου/.test(error.message)) throw error;
        skipped++;
      }
    }
    storage.setItem('axyp-hypotheses', JSON.stringify(existing));
    return { count: existing.length, skipped: skipped };
  }

  async function refreshFromFolder() {
    if (!casesHandle || !(await permission(handle, false))) return [];
    var all = await loadAll();
    (window.AXYP_STORAGE || localStorage).setItem('axyp-hypotheses', JSON.stringify(all));
    if (window.HypothesesView) window.HypothesesView.refresh();
    return all;
  }

  async function connect() {
    if (!window.showDirectoryPicker) {
      throw new Error('Ο browser δεν υποστηρίζει επιλογή κοινόχρηστου φακέλου. Χρησιμοποίησε πρόσφατο Microsoft Edge ή Google Chrome.');
    }
    // Ο χρήστης επιλέγει τη θέση-γονέα. Η εφαρμογή δημιουργεί εκεί τον φάκελο AX.YP.
    var parent = await window.showDirectoryPicker({ mode: 'readwrite' });
    if (!(await permission(parent, true))) throw new Error('Δεν δόθηκε άδεια εγγραφής στον επιλεγμένο φάκελο.');
    var root = await parent.getDirectoryHandle(ROOT_NAME, { create: true });
    var cases = await root.getDirectoryHandle(CASES_NAME, { create: true });
    await root.getDirectoryHandle('Πρότυπα', { create: true });
    handle = root;
    casesHandle = cases;
    await saveHandle(root);
    var result = await importLocalCases();
    status('Συνδεδεμένος κοινόχρηστος φάκελος AX.YP · ' + result.count + ' δικογραφίες' +
      (result.skipped ? ' · ' + result.skipped + ' τοπικές εγγραφές χρειάζονται στοιχεία/έλεγχο' : ''), false);
    if (window.HypothesesView) window.HypothesesView.refresh();
    return result;
  }

  async function restore() {
    try {
      handle = await readHandle();
      if (!handle) {
        status('Δεν έχει οριστεί ακόμη κοινόχρηστος φάκελος. Η αποθήκευση δικογραφιών είναι απενεργοποιημένη.', true);
        return;
      }
      if (!(await permission(handle, false))) {
        status('Χρειάζεται επανασύνδεση/έγκριση πρόσβασης στον κοινόχρηστο φάκελο.', true);
        return;
      }
      casesHandle = await handle.getDirectoryHandle(CASES_NAME);
      await refreshFromFolder();
      status('Συνδεδεμένος κοινόχρηστος φάκελος AX.YP.', false);
    } catch (error) {
      handle = null;
      casesHandle = null;
      status('Δεν ήταν δυνατή η πρόσβαση στον φάκελο: ' + error.message, true);
    }
  }

  var ready = restore();
  var connectButton = document.getElementById('connect-case-folder');
  if (connectButton) {
    connectButton.addEventListener('click', function () {
      connect().catch(function (error) {
        status(error.message || 'Αποτυχία σύνδεσης φακέλου.', true);
      });
    });
  }

  window.AXYP_CASE_FILES = {
    ready: ready,
    connect: connect,
    isConnected: function () { return !!(handle && casesHandle); },
    loadAll: loadAll,
    refresh: refreshFromFolder,
    saveCase: saveCase,
    saveDocument: saveDocument
  };
})();
