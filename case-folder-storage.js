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

  async function fileExists(directory, name) {
    try {
      await directory.getFileHandle(name);
      return true;
    } catch (error) {
      if (error && error.name === 'NotFoundError') return false;
      throw error;
    }
  }

  function numberedFileName(name, number) {
    var dot = name.lastIndexOf('.');
    return dot > 0
      ? name.slice(0, dot) + '-' + number + name.slice(dot)
      : name + '-' + number;
  }

  async function copyBundleDocuments(item, dossierDirectory) {
    if (!item.sourceBundleId) return;
    var bundles = [];
    try { bundles = JSON.parse(localStorageApi().getItem('axyp-case-bundles') || '[]'); } catch (_) {}
    var bundle = bundles.find(function (entry) { return entry.id === item.sourceBundleId; });
    if (!bundle || !Array.isArray(bundle.documents)) return;
    var documents = await dossierDirectory.getDirectoryHandle('Έγγραφα', { create: true });
    var usedNames = Object.create(null);
    for (var i = 0; i < bundle.documents.length; i++) {
      var doc = bundle.documents[i];
      if (!doc || !doc.data || !doc.name) continue;
      var parts = String(doc.data).split(',');
      if (parts.length < 2 || !/^data:[^,]*;base64$/i.test(parts[0])) continue;

      var originalName = safePart(doc.name);
      var name = originalName;
      var suffix = 2;
      while (usedNames[name]) name = numberedFileName(originalName, suffix++);
      usedNames[name] = true;

      // Bundle files are starter copies, not authoritative replacements.
      // Never overwrite a file that the officer may already have edited.
      if (await fileExists(documents, name)) continue;

      var binary = atob(parts[1]);
      var bytes = new Uint8Array(binary.length);
      for (var j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
      var fileHandle = await documents.getFileHandle(name, { create: true });
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
    var history = await directory.getDirectoryHandle('Ιστορικό', { create: true });
    await writeText(history, 'εκδόσεις.json', JSON.stringify(saved.snapshots || [], null, 2), 'application/json');
    await directory.getDirectoryHandle('Έγγραφα', { create: true });
    await copyBundleDocuments(saved, directory);
    // Write the case manifest last: it represents the committed metadata version.
    await writeText(directory, 'case.json', JSON.stringify(saved, null, 2), 'application/json');
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

  async function listDocuments(caseId) {
    if (!casesDirectory) return [];
    var all = await loadAll();
    var item = all.find(function (entry) { return entry.id === caseId; });
    if (!item) return [];
    var dossier = await casesDirectory.getDirectoryHandle(item.folderName || folderName(item));
    var documents = await dossier.getDirectoryHandle('Έγγραφα', { create: true });
    var result = [];
    for await (var entry of documents.values()) {
      if (entry.kind !== 'file') continue;
      var file = await entry.getFile();
      result.push({ name: entry.name, size: file.size, type: file.type || 'application/octet-stream', updatedAt: file.lastModified });
    }
    return result.sort(function (a, b) { return a.name.localeCompare(b.name, 'el'); });
  }

  async function readDocument(caseId, fileName) {
    if (!casesDirectory) throw new Error('Δεν έχει επιλεγεί προσωπικός φάκελος εργασίας.');
    var all = await loadAll();
    var item = all.find(function (entry) { return entry.id === caseId; });
    if (!item) throw new Error('Δεν βρέθηκε η επιλεγμένη δικογραφία.');
    var dossier = await casesDirectory.getDirectoryHandle(item.folderName || folderName(item));
    var documents = await dossier.getDirectoryHandle('Έγγραφα');
    var handle = await documents.getFileHandle(fileName);
    return handle.getFile();
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
    remote.forEach(function (item) {
      if (!byId.has(item.id)) {
        byId.set(item.id, item);
      } else {
        var current = byId.get(item.id);
        var remoteIsNewer = Date.parse(item.updatedAt || '') > Date.parse(current.updatedAt || '');
        byId.set(item.id, Object.assign({}, remoteIsNewer ? item : current, {
          folderName: item.folderName,
          workspaceRevision: item.workspaceRevision
        }));
      }
    });
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
    var stored = localStorageApi();
    var local = [];
    try { local = JSON.parse(stored.getItem('axyp-hypotheses') || '[]'); } catch (_) {}
    var migrated = 0;
    var skipped = 0;
    var remoteIds = new Set((await loadAll()).map(function (item) { return item.id; }));
    for (var i = 0; i < local.length; i++) {
      if (remoteIds.has(local[i].id)) continue;
      if (!local[i].offence || !local[i].protocolNumber) { skipped++; continue; }
      try {
        var saved = await saveCase(local[i]);
        local[i] = saved;
        remoteIds.add(saved.id);
        migrated++;
      } catch (error) {
        skipped++;
      }
    }
    stored.setItem('axyp-hypotheses', JSON.stringify(local));
    status('Προσωπικός χώρος εργασίας: ' + workspace.name + ' · ' + count + ' υπάρχουσες δικογραφίες · ' + migrated + ' μεταφέρθηκαν από τον browser' + (skipped ? ' · ' + skipped + ' χρειάζονται έλεγχο' : '') + '.', false);
    if (window.HypothesesView) window.HypothesesView.refresh();
    return { count: count, migrated: migrated, skipped: skipped, name: workspace.name };
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
    listDocuments: listDocuments,
    readDocument: readDocument,
    saveCase: saveCase,
    saveSnapshot: saveSnapshot,
    saveDocument: saveDocument
  };
})();
