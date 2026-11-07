// Τοπική αποθήκευση AX.YP με IndexedDB, συμβατό σύγχρονο API και ρητή επιβεβαίωση εγγραφών.
(function () {
  'use strict';

  var DB_NAME = 'axyp-local-db';
  var STORE_NAME = 'kv';
  var STORAGE_SCHEMA_VERSION = 3;
  var SCHEMA_KEY = 'axyp-storage-schema';
  var META_PREFIX = 'axyp-storage-meta:';
  var revisionClock = Date.now();
  var TAB_ID = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  var channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('axyp-storage') : null;
  var conflicts = Object.create(null);
  var conflictListeners = [];
  var changeListeners = [];
  var localRevisions = Object.create(null);
  var dbPromise = null;
  var cache = Object.create(null);
  var dirtyKeys = Object.create(null);
  var pendingWrites = [];
  var pendingFailures = [];
  var lastError = null;
  var indexedDBAvailable = !!(window.indexedDB && typeof indexedDB !== 'undefined');

  var KNOWN_KEYS = [
    'axyp-hypotheses',
    'axyp-case-bundles',
    'axyp-docx-templates',
    'axyp-template-mappings',
    'axyp-favorites',
    'axyp-form-profile',
    'axyp-service-profile-v1',
    'axyp-theme',
    'axyp-privacy',
    'axyp-narcotics-templates-seeded-v1',
    'axyp-counterfeit-templates-seeded-v1',
    'axyp-environment-templates-seeded-v1',
    'axyp-health-templates-seeded-v1',
    'axyp-noise-templates-seeded-v1',
    'axyp-camping-templates-seeded-v1'
  ];

  function makeError(message, cause) {
    var error = new Error(message);
    if (cause) error.cause = cause;
    return error;
  }

  function openDB() {
    if (!dbPromise) {
      dbPromise = new Promise(function (resolve) {
        if (!indexedDBAvailable) return resolve(null);
        try {
          var req = indexedDB.open(DB_NAME, STORAGE_SCHEMA_VERSION);
          req.onupgradeneeded = function (event) {
            var db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
          };
          req.onsuccess = function (event) {
            var db = event.target.result;
            db.onversionchange = function () {
              try { db.close(); } catch (_) {}
              dbPromise = null;
            };
            resolve(db);
          };
          req.onerror = function () {
            lastError = req.error || makeError('Δεν ήταν δυνατό να ανοίξει η τοπική βάση δεδομένων.');
            resolve(null);
          };
          req.onblocked = function () {
            lastError = makeError('Η τοπική βάση δεδομένων είναι προσωρινά αποκλεισμένη από άλλη καρτέλα.');
            // Μην κρατάμε όλη την εφαρμογή σε αναμονή· συνεχίζουμε με localStorage fallback.
            resolve(null);
          };
        } catch (error) {
          lastError = error;
          resolve(null);
        }
      });
    }
    return dbPromise;
  }

  function transactionDone(tx) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      tx.oncomplete = function () {
        if (settled) return;
        settled = true;
        resolve();
      };
      tx.onerror = function () {
        if (settled) return;
        settled = true;
        reject(tx.error || makeError('Απέτυχε η συναλλαγή της τοπικής βάσης δεδομένων.'));
      };
      tx.onabort = function () {
        if (settled) return;
        settled = true;
        reject(tx.error || makeError('Ακυρώθηκε η συναλλαγή της τοπικής βάσης δεδομένων.'));
      };
    });
  }

  function readLocalStorage(key) {
    try { return localStorage.getItem(key); } catch (error) {
      lastError = error;
      return null;
    }
  }

  function readLocalMeta(key) {
    try {
      var raw = localStorage.getItem(META_PREFIX + key);
      var parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !Number.isFinite(Number(parsed.revision))) return null;
      return { revision: Number(parsed.revision), updatedAt: String(parsed.updatedAt || ''), deleted: parsed.deleted === true };
    } catch (_) { return null; }
  }

  function nextRevision() {
    revisionClock = Math.max(Date.now(), revisionClock + 1);
    return revisionClock;
  }

  function makeRecord(value, revision, deleted) {
    return { __axypRecord: 1, value: deleted ? null : value, deleted: deleted === true, revision: revision, updatedAt: new Date().toISOString() };
  }

  function asRecord(value) {
    if (value && typeof value === 'object' && value.__axypRecord === 1 && Number.isFinite(Number(value.revision)) && (value.deleted === true || typeof value.value === 'string')) {
      return { value: value.deleted === true ? null : value.value, deleted: value.deleted === true, revision: Number(value.revision), updatedAt: String(value.updatedAt || '') };
    }
    return null;
  }

  function preferRecord(localValue, localMeta, indexedValue) {
    var indexedRecord = asRecord(indexedValue);
    if (localMeta && localMeta.deleted && (!indexedRecord || localMeta.revision >= indexedRecord.revision)) return { value: null, deleted: true, revision: localMeta.revision };
    if (!indexedRecord) return localValue !== null ? { value: localValue, deleted: false, revision: localMeta ? localMeta.revision : 0 } : (indexedValue !== undefined && indexedValue !== null ? { value: String(indexedValue), deleted: false, revision: 0 } : null);
    if (indexedRecord.deleted && (!localMeta || indexedRecord.revision >= localMeta.revision)) return indexedRecord;
    if (localValue === null || !localMeta) return indexedRecord;
    return indexedRecord.revision > localMeta.revision ? indexedRecord : { value: localValue, deleted: false, revision: localMeta.revision };
  }

  // Το σύγχρονο API διατηρείται για συμβατότητα με τις υπάρχουσες ενότητες.
  // Οι κρίσιμες ροές μπορούν να καλέσουν flush()/setItemDurable() για επιβεβαίωση.
  KNOWN_KEYS.forEach(function (key) {
    var value = readLocalStorage(key);
    var meta = readLocalMeta(key);
    if (value !== null) cache[key] = value;
    if (meta) {
      localRevisions[key] = meta.revision;
      revisionClock = Math.max(revisionClock, meta.revision);
      if (meta.deleted) delete cache[key];
    }
  });

  function migrateSchema(db) {
    if (!db) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var tx;
      try {
        tx = db.transaction(STORE_NAME, 'readwrite');
        var store = tx.objectStore(STORE_NAME);
        var request = store.get(SCHEMA_KEY);
        request.onsuccess = function () {
          var current = request.result && Number(request.result.version || request.result) || 0;
          if (current >= STORAGE_SCHEMA_VERSION) return;
          store.put({ version: STORAGE_SCHEMA_VERSION, migratedAt: new Date().toISOString() }, SCHEMA_KEY);
        };
        transactionDone(tx).then(resolve).catch(reject);
      } catch (error) { reject(error); }
    });
  }

  var ready = openDB().then(function (db) {
    if (!db) return getStatus();
    return migrateSchema(db).then(function () { return new Promise(function (resolve) {
      var pendingMigration = [];
      var tx;
      try {
        tx = db.transaction(STORE_NAME, 'readonly');
        var store = tx.objectStore(STORE_NAME);
        KNOWN_KEYS.forEach(function (key) {
          var request = store.get(key);
          request.onsuccess = function () {
            if (dirtyKeys[key]) return;
            var localValue = readLocalStorage(key);
            var localMeta = readLocalMeta(key);
            var chosen = preferRecord(localValue, localMeta, request.result);
            if (chosen) {
              if (chosen.deleted) delete cache[key];
              else cache[key] = chosen.value;
              localRevisions[key] = chosen.revision;
              if (chosen.deleted || chosen.value !== localValue || !localMeta || chosen.revision > localMeta.revision || !!chosen.deleted !== !!(localMeta && localMeta.deleted)) pendingMigration.push([key, chosen.value, chosen.revision, chosen.deleted === true]);
            }
          };
        });
        tx.oncomplete = function () {
          if (!pendingMigration.length) return resolve(getStatus());
          try {
            var writeTx = db.transaction(STORE_NAME, 'readwrite');
            var writeStore = writeTx.objectStore(STORE_NAME);
            pendingMigration.forEach(function (entry) {
              if (!dirtyKeys[entry[0]]) writeStore.put(makeRecord(entry[1], entry[2], entry[3]), entry[0]);
            });
            transactionDone(writeTx).then(function () {
              pendingMigration.forEach(function (entry) {
                try {
                  if (entry[3]) localStorage.removeItem(entry[0]);
                  else localStorage.setItem(entry[0], entry[1]);
                  localStorage.setItem(META_PREFIX + entry[0], JSON.stringify({ revision: entry[2], deleted: entry[3], updatedAt: new Date().toISOString() }));
                } catch (_) {}
              });
              resolve(getStatus());
            }).catch(function (error) {
              lastError = error;
              resolve(getStatus());
            });
          } catch (error) {
            lastError = error;
            resolve(getStatus());
          }
        };
        tx.onerror = tx.onabort = function () {
          lastError = tx.error || makeError('Δεν ολοκληρώθηκε η ανάγνωση της τοπικής βάσης.');
          resolve(getStatus());
        };
      } catch (error) {
        lastError = error;
        resolve(getStatus());
      }
    }); });
  }).catch(function (error) {
    lastError = error;
    return getStatus();
  });

  function getStatus() {
    var firstFailure = pendingFailures[0];
    var hasError = !!firstFailure || (!!lastError && !indexedDBAvailable);
    return {
      indexedDBAvailable: indexedDBAvailable,
      degraded: hasError,
      error: hasError ? (firstFailure ? String(firstFailure.error.message || firstFailure.error) : String(lastError ? (lastError.message || lastError) : '')) : null
    };
  }

  function clearError() {
    lastError = null;
    pendingFailures.splice(0);
  }

  function notifyChange(key, value, revision, remote) {
    var event = { key: key, value: value === undefined ? null : value, revision: Number(revision || 0), remote: !!remote, source: remote ? 'remote' : 'local' };
    changeListeners.slice().forEach(function (listener) { try { listener(event); } catch (_) {} });
    try { window.dispatchEvent(new CustomEvent('axyp:storage-change', { detail: event })); } catch (_) {}
  }

  function notifyConflict(conflict) {
    conflictListeners.slice().forEach(function (listener) { try { listener(conflict); } catch (_) {} });
    try { window.dispatchEvent(new CustomEvent('axyp:storage-conflict', { detail: conflict })); } catch (_) {}
  }

  function receiveRemoteChange(message) {
    if (!message || message.source === TAB_ID || !message.key || message.key.indexOf('axyp-') !== 0 || message.key.indexOf(META_PREFIX) === 0) return;
    var revision = Number(message.revision || 0);
    revisionClock = Math.max(revisionClock, revision);
    if (dirtyKeys[message.key]) {
      localRevisions[message.key] = Math.max(localRevisions[message.key] || 0, revision);
      conflicts[message.key] = { key: message.key, localValue: cache[message.key] ?? null, remoteValue: message.value ?? null, revision: revision, detectedAt: new Date().toISOString() };
      notifyConflict(conflicts[message.key]);
      return;
    }
    if (revision <= (localRevisions[message.key] || 0)) return;
    localRevisions[message.key] = revision;
    if (message.value === null) delete cache[message.key];
    else cache[message.key] = message.value;
    notifyChange(message.key, message.value, revision, true);
  }
  if (channel) channel.onmessage = function (event) { receiveRemoteChange(event.data); };
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('storage', function (event) {
    if (!event.key || event.key.indexOf(META_PREFIX) === 0) return;
    var meta = readLocalMeta(event.key);
    receiveRemoteChange({ key: event.key, value: event.newValue, revision: meta ? meta.revision : Date.now(), source: 'storage-event' });
  });

  function getItem(key) {
    if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
    return readLocalStorage(key);
  }

  function broadcastChange(key, value, explicitRevision) {
    var revision = explicitRevision || nextRevision();
    localRevisions[key] = revision;
    if (channel) channel.postMessage({ source: TAB_ID, key: key, value: value, revision: revision });
    return revision;
  }

  function getConflicts() { return Object.values(conflicts); }
  function resolveConflict(key, choice) {
    var conflict = conflicts[key];
    if (!conflict) return Promise.resolve(getStatus());
    delete conflicts[key];
    var selectedValue = choice === 'remote' ? conflict.remoteValue : conflict.localValue;
    if (selectedValue === null || selectedValue === undefined) return removeItemDurable(key);
    return setItemDurable(key, selectedValue);
  }
  function onConflict(listener) { if (typeof listener === 'function') conflictListeners.push(listener); return function () { conflictListeners = conflictListeners.filter(function (entry) { return entry !== listener; }); }; }
  function onChange(listener) { if (typeof listener !== 'function') return function () {}; changeListeners.push(listener); return function () { changeListeners = changeListeners.filter(function (entry) { return entry !== listener; }); }; }

  function trackWrite(operation, key) {
    var tracked = Promise.resolve(operation).then(function () {
      pendingFailures = pendingFailures.filter(function (failure) { return failure.key !== key; });
      delete dirtyKeys[key];
      if (!pendingFailures.length) lastError = null;
      return { ok: true };
    }).catch(function (error) {
      lastError = error;
      return { ok: false, error: error };
    });
    pendingWrites.push(tracked);
    tracked.then(function (result) {
      if (!result.ok) {
        pendingFailures = pendingFailures.filter(function (failure) { return failure.key !== key; });
        pendingFailures.push({ key: key, error: result.error });
      }
      var index = pendingWrites.indexOf(tracked);
      if (index !== -1) pendingWrites.splice(index, 1);
    });
    return tracked;
  }

  function writeToDB(key, value, remove, revision) {
    return openDB().then(function (db) {
      if (!db) throw lastError || makeError('Το IndexedDB δεν είναι διαθέσιμο.');
      var tx = db.transaction(STORE_NAME, 'readwrite');
      var store = tx.objectStore(STORE_NAME);
      if (remove) store.put(makeRecord(null, revision, true), key);
      else store.put(makeRecord(value, revision, false), key);
      return transactionDone(tx).then(function () {
      });
    });
  }

  function setItem(key, value) {
    if (conflicts[key]) {
      lastError = makeError('Η εγγραφή απορρίφθηκε: υπάρχει νεότερη αλλαγή σε άλλη καρτέλα.');
      notifyConflict(conflicts[key]);
      return false;
    }
    var stringValue = String(value);
    var revision = nextRevision();
    cache[key] = stringValue;
    localRevisions[key] = revision;
    dirtyKeys[key] = true;
    broadcastChange(key, stringValue, revision);
    notifyChange(key, stringValue, revision, false);
    var localOk = false;
    try {
      localStorage.setItem(key, stringValue);
      localStorage.setItem(META_PREFIX + key, JSON.stringify({ revision: revision, deleted: false, updatedAt: new Date().toISOString() }));
      localOk = true;
    } catch (error) {
      if (!indexedDBAvailable) {
        lastError = error;
      }
    }
    trackWrite(writeToDB(key, stringValue, false, revision).catch(function (error) {
      if (localOk) return;
      throw makeError('Δεν αποθηκεύτηκαν τα δεδομένα ούτε στο IndexedDB ούτε στο localStorage.', error);
    }), key);
  }

  function setItemDurable(key, value) {
    if (setItem(key, value) === false) return Promise.reject(lastError || makeError('Η εγγραφή απορρίφθηκε λόγω σύγκρουσης.'));
    return flush();
  }

  function removeItem(key) {
    if (conflicts[key]) {
      lastError = makeError('Η διαγραφή απορρίφθηκε: υπάρχει ανεπίλυτη αλλαγή σε άλλη καρτέλα.');
      notifyConflict(conflicts[key]);
      return false;
    }
    var revision = nextRevision();
    delete cache[key];
    localRevisions[key] = revision;
    dirtyKeys[key] = true;
    broadcastChange(key, null, revision);
    notifyChange(key, null, revision, false);
    var localOk = false;
    try {
      localStorage.removeItem(key);
      localStorage.setItem(META_PREFIX + key, JSON.stringify({ revision: revision, deleted: true, updatedAt: new Date().toISOString() }));
      localOk = true;
    } catch (error) {
      if (!indexedDBAvailable) {
        lastError = error;
      }
    }
    trackWrite(writeToDB(key, null, true, revision).catch(function (error) {
      if (localOk) return;
      throw makeError('Δεν διαγράφηκαν τα δεδομένα ούτε από το IndexedDB ούτε από το localStorage.', error);
    }), key);
  }

  function removeItemDurable(key) {
    if (removeItem(key) === false) return Promise.reject(lastError || makeError('Η διαγραφή απορρίφθηκε λόγω σύγκρουσης.'));
    return flush();
  }

  function setItemsDurable(entries) {
    return flush().then(function () {
      if (!Array.isArray(entries) || !entries.length) throw new Error('Δεν δόθηκαν έγκυρα δεδομένα επαναφοράς.');
      if (entries.some(function (entry) { return Array.isArray(entry) && conflicts[entry[0]]; })) {
        throw new Error('Η επαναφορά απορρίφθηκε: υπάρχει νεότερη αλλαγή σε άλλη καρτέλα.');
      }
      var normalized = entries.map(function (entry) {
        if (!Array.isArray(entry) || typeof entry[0] !== 'string' || entry[0].indexOf('axyp-') !== 0) {
          throw new Error('Το αντίγραφο περιέχει μη επιτρεπτό κλειδί αποθήκευσης.');
        }
        return [entry[0], entry[1] === null || entry[1] === undefined ? null : String(entry[1]), nextRevision()];
      });
      return openDB().then(function (db) {
        var committedToDb = false;
        var dbError = null;
        if (db) {
          try {
            var tx = db.transaction(STORE_NAME, 'readwrite');
            var store = tx.objectStore(STORE_NAME);
            normalized.forEach(function (entry) {
              if (entry[1] === null) store.put(makeRecord(null, entry[2], true), entry[0]);
              else store.put(makeRecord(entry[1], entry[2], false), entry[0]);
            });
            return transactionDone(tx).then(function () {
              committedToDb = true;
            }).catch(function (error) {
              dbError = error;
              lastError = error;
            }).then(finish);
          } catch (error) {
            dbError = error;
            lastError = error;
          }
        }
        return finish();

        function finish() {
          if (!committedToDb) {
            var previous = [];
            try {
              normalized.forEach(function (entry) {
                previous.push([entry[0], localStorage.getItem(entry[0])]);
              });
              normalized.forEach(function (entry) {
                if (entry[1] === null) localStorage.removeItem(entry[0]);
                else localStorage.setItem(entry[0], entry[1]);
                localStorage.setItem(META_PREFIX + entry[0], JSON.stringify({ revision: entry[2], deleted: entry[1] === null, updatedAt: new Date().toISOString() }));
              });
            } catch (error) {
              previous.forEach(function (entry) {
                try {
                  if (entry[1] === null) localStorage.removeItem(entry[0]);
                  else localStorage.setItem(entry[0], entry[1]);
                } catch (_) {}
              });
              throw makeError('Η επαναφορά δεν αποθηκεύτηκε. Δεν επιβεβαιώθηκε εγγραφή στο IndexedDB ή στο localStorage.', dbError || error);
            }
          } else {
            try {
              normalized.forEach(function (entry) {
                if (entry[1] === null) localStorage.removeItem(entry[0]);
                else localStorage.setItem(entry[0], entry[1]);
                localStorage.setItem(META_PREFIX + entry[0], JSON.stringify({ revision: entry[2], deleted: entry[1] === null, updatedAt: new Date().toISOString() }));
              });
            } catch (error) {
              // localStorage quota exceeded is expected for large datasets (>5MB).
              // Since IndexedDB committed successfully, storage remains non-degraded.
            }
            var restoredKeys = Object.create(null);
            normalized.forEach(function (entry) { restoredKeys[entry[0]] = true; });
            pendingFailures = pendingFailures.filter(function (failure) { return !restoredKeys[failure.key]; });
            if (!pendingFailures.length) lastError = null;
          }
          normalized.forEach(function (entry) {
            if (entry[1] === null) delete cache[entry[0]];
            else cache[entry[0]] = entry[1];
            localRevisions[entry[0]] = entry[2];
            delete dirtyKeys[entry[0]];
            broadcastChange(entry[0], entry[1], entry[2]);
            notifyChange(entry[0], entry[1], entry[2], false);
          });
          return getStatus();
        }
      });
    });
  }

  function flush() {
    return ready.then(function () {
      var tasks = pendingWrites.slice();
      return Promise.all(tasks).then(function () {
        var failures = pendingFailures.slice();
        if (failures.length) {
          var first = failures[0].error;
          throw makeError('Η αποθήκευση δεν επιβεβαιώθηκε: ' + (first.message || first), first);
        }
        lastError = null;
        return getStatus();
      });
    });
  }

  function clear() {
    Object.keys(cache).forEach(function (key) {
      if (key.indexOf('axyp-') === 0) {
        delete cache[key];
        dirtyKeys[key] = true;
      }
    });

    var localOk = true;
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var key = localStorage.key(i);
        if (key && key.indexOf('axyp-') === 0) {
          dirtyKeys[key] = true;
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      localOk = false;
      lastError = error;
    }

    var operation = openDB().then(function (db) {
      if (!db) throw lastError || makeError('Το IndexedDB δεν είναι διαθέσιμο.');
      var tx = db.transaction(STORE_NAME, 'readwrite');
      var store = tx.objectStore(STORE_NAME);
      if (typeof store.getAllKeys === 'function') {
        var request = store.getAllKeys();
        request.onsuccess = function () {
          (request.result || []).forEach(function (key) {
            if (typeof key === 'string' && key.indexOf('axyp-') === 0) store.delete(key);
          });
        };
        request.onerror = function () {
          try { tx.abort(); } catch (_) {}
        };
      } else {
        KNOWN_KEYS.forEach(function (key) { store.delete(key); });
      }
      return transactionDone(tx);
    }).catch(function (error) {
      if (localOk) return;
      throw makeError('Δεν ολοκληρώθηκε η εκκαθάριση ούτε στο IndexedDB ούτε στο localStorage.', error);
    });
    return trackWrite(operation).then(function (result) {
      if (!result.ok) throw result.error;
      return getStatus();
    });
  }

  function checkQuota() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate().then(function (estimate) {
        if (typeof estimate.quota === 'number' && typeof estimate.usage === 'number') {
          var freeBytes = Math.max(0, estimate.quota - estimate.usage);
          return {
            low: freeBytes < 10 * 1024 * 1024,
            freeMb: Math.round(freeBytes / (1024 * 1024)),
            quotaMb: Math.round(estimate.quota / (1024 * 1024)),
            usageMb: Math.round(estimate.usage / (1024 * 1024))
          };
        }
        return { low: false };
      }).catch(function () { return { low: false }; });
    }
    return Promise.resolve({ low: false });
  }

  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try { navigator.storage.persist().catch(function () {}); } catch (_) {}
  }

  window.AXYP_STORAGE = {
    getItem: getItem,
    setItem: setItem,
    setItemDurable: setItemDurable,
    setItemsDurable: setItemsDurable,
    removeItem: removeItem,
    removeItemDurable: removeItemDurable,
    clear: clear,
    flush: flush,
    checkQuota: checkQuota,
    getStatus: getStatus,
    getSchemaVersion: function () { return STORAGE_SCHEMA_VERSION; },
    getConflicts: getConflicts,
    resolveConflict: resolveConflict,
    onConflict: onConflict,
    onChange: onChange,
    clearError: clearError,
    ready: ready
  };
})();
