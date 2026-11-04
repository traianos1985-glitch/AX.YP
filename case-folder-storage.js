// Τοπικός χώρος εργασίας AX.YP. Δεν γράφει ποτέ στον κοινόχρηστο φάκελο υπηρεσίας.
// Ο χρήστης επιλέγει προσωπικό φάκελο· η μεταφορά στο κοινόχρηστο αρχείο γίνεται
// χειροκίνητα από την Εξερεύνηση αρχείων των Windows.
(function () {
  'use strict';

  var DB_NAME = 'axyp-workspace-handles';
  var STORE_NAME = 'handles';
  var HANDLE_KEY = 'personal-workspace';
  var CASES_NAME = 'Δικογραφίες';
  var workspace = null;
  var casesDirectory = null;

  function status(message, error) {
    var node = document.getElementById('case-folder-status');
    if (!node) return;
    node.textContent = message;
    node.setAttribute('data-state', error ? 'error' : 'ok');
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('Δεν ήταν δυνατή η αποθήκευση της επιλογής φακέλου.')); };
    });
  }

  async function storeHandle(handle) {
    var db = await openDb();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
      tx.oncomplete = function () { db.close(); resolve(); };
      tx.onerror = tx.onabort = function () { db.close(); reject(tx.error || new Error('Αποτυχία αποθήκευσης ρυθμίσεων.')); };
    });
  }

  async function readHandle() {
    var db = await openDb();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readonly');
      var request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      request.onsuccess = function () { resolve(request.result || null); };
      request.onerror = function () { reject(request.error); };
      tx.oncomplete = function () { db.close(); };
      tx.onerror = function () { db.close(); };
    });
  }

  async function hasPermission(handle, ask) {
    if (!handle) return false;
    var options = { mode: 'readwrite' };
    if (await handle.queryPermission(options) === 'granted') return true;
    return !!(ask && await handle.requestPermission(options) === 'granted');
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
    if (!item.offence || !item.protocolNumber) {
      throw new Error('Για να δημιουργηθεί ο φάκελος δικογραφίας, συμπλήρωσε είδος υπόθεσης και αριθμό πρωτοκόλλου.');
    }
    return safePart(item.offence) + '_' + safePart(item.protocolNumber);
  }

  async function writeText(directory, name, content, type) {
    var fileHandle = await directory.getFileHandle(name, { create: true });
    var writable = await fileHandle.createWritable();
    await writable.write(new Blob([content], { type: type || 'text/plain;charset=utf-8' }));
    await writable.close();
  }

  async function readJson(directory, name) {
    try {
      var file = await (await directory.getFileHandle(name)).getFile();
      return JSON.parse(await file.text());
    } catch (error) {
      if (error && error.name === 'NotFoundError') return null;
      throw error;
    }
  }

  function localStorageApi() { return window.AXYP_STORAGE || localStorage; }

  async function copyBundleDocuments(item, dossierDirectory) {
    if (!item.sourceBundleId) return;
    var bundles = [];
    try { bundles = JSON.parse(localStorageApi().getItem('axyp-case-bundles') || '[]'); } catch (_) {}
    var bundle = bundles.find(function (entry) { return entry.id === item.sourceBundleId; });
    if (!bundle || !Array.isArray(bundle.documents)) return;
    var documents = await dossierDirectory.getDirectoryHandle('Έγγραφα', { create: true });
    for (var i = 0; i < bundle.documents.length; i++) {
      var doc = bundle.documents[i];
      if (!doc || !doc.data || !doc.name) continue;
      var parts = String(doc.data).split(',');
      if (parts.length < 2) continue;
      var binary = atob(parts[1]);
      var bytes = new Uint8Array(binary.length);
      for (var j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
      var fileHandle = await documents.getFileHandle(safePart(doc.name), { create: true });
      var writable = await fileHandle.createWritable();
      await writable.write(new Blob([bytes], { type: doc.type || 'application/octet-stream' }));
      await writable.close();
    }
  }

  async function saveCase(item) {
    if (!casesDirectory || !(await hasPermission(workspace, false))) {
      throw new Error('Επίλεξε πρώτα τον προσωπικό φάκελο εργασίας και δώσε άδεια εγγραφής.');
    }
    var name = folderName(item);
    var directory = await casesDirectory.getDirectoryHandle(name, { create: true });
    var existing = await readJson(directory, 'case.json');
    if (existing && existing.id !== item.id) {
      throw new Error('Υπάρχει ήδη διαφορετική δικογραφία με ίδιο είδος και αριθμό πρωτοκόλλου. Δεν έγινε αντικατάσταση.');
    }
    if (existing && Number(existing.workspaceRevision || 0) !== Number(item.workspaceRevision || 0)) {
      throw new Error('Το αρχείο στον φάκελο έχει διαφορετική έκδοση. Δεν έγινε αντικατάσταση· φόρτωσε ή έλεγξε πρώτα την τελευταία έκδοση.');
    }
    var saved = Object.assign({}, item, {
      folderName: name,
      workspaceRevision: Number(existing && existing.workspaceRevision || 0) + 1,
      updatedAt: new Date().toISOString()
    });
    await writeText(directory, 'case.json', JSON.stringify(saved, null, 2), 'application/json');
    var history = await directory.getDirectoryHandle('Ιστορικό', { create: true });
    await writeText(history, 'εκδόσεις.json', JSON.stringify(saved.snapshots || [], null, 2), 'application/json');
    await directory.getDirectoryHandle('Έγγραφα', { create: true });
    await copyBundleDocuments(saved, directory);
    return saved;
  }

  async function saveSnapshot(item) {
    return saveCase(item);
  }

  async function saveDocument(caseId, fileName, blob) {
    if (!casesDirectory || !(await hasPermission(workspace, false))) {
      throw new Error('Δεν έχει επιλεγεί προσωπικός φάκελος εργασίας.');
    }
    var all = await loadAll();
    var item = all.find(function (entry) { return entry.id === caseId; });
    if (!item) throw new Error('Δεν βρέθηκε η επιλεγμένη δικογραφία στον φάκελο εργασίας.');
    var dossier = await casesDirectory.getDirectoryHandle(item.folderName || folderName(item));
    var documents = await dossier.getDirectoryHandle('Έγγραφα', { create: true });
    var file = await documents.getFileHandle(safePart(fileName), { create: true });
    var writable = await file.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  async function loadAll() {
    if (!casesDirectory) return [];
    var records = [];
    for await (var entry of casesDirectory.values()) {
      if (entry.kind !== 'directory') continue;
      var record = await readJson(entry, 'case.json');
      if (record && record.id) {
        record.folderName = entry.name;
        records.push(record);
      }
    }
    records.sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
    return records;
  }

  async function mergeWorkspaceIntoBrowser() {
    var stored = localStorageApi();
    var local = [];
    try { local = JSON.parse(stored.getItem('axyp-hypotheses') || '[]'); } catch (_) {}
    var remote = await loadAll();
    var byId = new Map(local.map(function (item) { return [item.id, item]; }));
    remote.forEach(function (item) { if (!byId.has(item.id)) byId.set(item.id, item); });
    stored.setItem('axyp-hypotheses', JSON.stringify(Array.from(byId.values())));
    if (window.HypothesesView) window.HypothesesView.refresh();
    return remote.length;
  }

  async function connect() {
    if (!window.showDirectoryPicker) {
      throw new Error('Ο browser δεν υποστηρίζει επιλογή φακέλου. Χρησιμοποίησε πρόσφατο Microsoft Edge ή Google Chrome.');
    }
    // Επιλέγεται ο ίδιος ο προσωπικός φάκελος που έχει δημιουργήσει το στέλεχος.
    var selected = await window.showDirectoryPicker({ mode: 'readwrite' });
    if (!(await hasPermission(selected, true))) throw new Error('Δεν δόθηκε άδεια εγγραφής στον επιλεγμένο φάκελο.');
    workspace = selected;
    casesDirectory = await workspace.getDirectoryHandle(CASES_NAME, { create: true });
    await storeHandle(workspace);
    var count = await mergeWorkspaceIntoBrowser();
    status('Προσωπικός χώρος εργασίας: ' + workspace.name + ' · ' + count + ' δικογραφίες από τον φάκελο.', false);
    return { count: count, name: workspace.name };
  }

  async function restore() {
    try {
      workspace = await readHandle();
      if (!workspace) {
        status('Δεν έχει επιλεγεί προσωπικός φάκελος εργασίας. Τα δεδομένα παραμένουν προσωρινά στον browser μέχρι να επιλέξεις φάκελο.', true);
        return;
      }
      if (!(await hasPermission(workspace, false))) {
        status('Χρειάζεται νέα έγκριση πρόσβασης στον προσωπικό φάκελο. Πάτησε «Επιλογή φακέλου εργασίας».', true);
        return;
      }
      casesDirectory = await workspace.getDirectoryHandle(CASES_NAME, { create: true });
      var count = await mergeWorkspaceIntoBrowser();
      status('Προσωπικός χώρος εργασίας: ' + workspace.name + ' · ' + count + ' δικογραφίες.', false);
    } catch (error) {
      workspace = null;
      casesDirectory = null;
      status('Δεν ήταν δυνατή η πρόσβαση στον φάκελο εργασίας: ' + error.message, true);
    }
  }

  var ready = restore();
  var button = document.getElementById('connect-case-folder');
  if (button) button.addEventListener('click', function () {
    connect().catch(function (error) { status(error.message || 'Αποτυχία επιλογής φακέλου.', true); });
  });

  window.AXYP_WORKSPACE = {
    ready: ready,
    connect: connect,
    isConnected: function () { return !!(workspace && casesDirectory); },
    loadAll: loadAll,
    saveCase: saveCase,
    saveSnapshot: saveSnapshot,
    saveDocument: saveDocument
  };
})();
