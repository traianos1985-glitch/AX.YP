// Τοπική αποθήκευση AX.YP με IndexedDB, συμβατό σύγχρονο API και ρητή επιβεβαίωση εγγραφών.
(function () {
  'use strict';

  var DB_NAME = 'axyp-local-db';
  var STORE_NAME = 'kv';
  var STORAGE_SCHEMA_VERSION = 2;
  var SCHEMA_KEY = 'axyp-storage-schema';
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

  // Το σύγχρονο API διατηρείται για συμβατότητα με τις υπάρχουσες ενότητες.
  // Οι κρίσιμες ροές μπορούν να καλέσουν flush()/setItemDurable() για επιβεβαίωση.
  KNOWN_KEYS.forEach(function (key) {
    var value = readLocalStorage(key);
    if (value !== null) cache[key] = value;
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
            if (request.result !== undefined && request.result !== null) {
              cache[key] = request.result;
            } else if (cache[key] !== undefined) {
              pendingMigration.push([key, cache[key]]);
            }
          };
        });
        tx.oncomplete = function () {
          if (!pendingMigration.length) return resolve(getStatus());
          try {
            var writeTx = db.transaction(STORE_NAME, 'readwrite');
            var writeStore = writeTx.objectStore(STORE_NAME);
            pendingMigration.forEach(function (entry) {
              if (!dirtyKeys[entry[0]]) writeStore.put(entry[1], entry[0]);
            });
            transactionDone(writeTx).then(function () {
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

  function notifyConflict(conflict) {
    conflictListeners.slice().forEach(function (listener) { try { listener(conflict); } catch (_) {} });
    try { window.dispatchEvent(new CustomEvent('axyp:storage-conflict', { detail: conflict })); } catch (_) {}
  }

  function notifyChange(key, value, revision, remote) {
    var event = { key: key, value: value, revision: Number(revision || 0), remote: !!remote, source: remote ? 'remote' : 'local' };
    changeListeners.slice().forEach(function (listener) { try { listener(event); } catch (_) {} });
    try { window.dispatchEvent(new CustomEvent('axyp:storage-change', { detail: event })); } catch (_) {}
  }

  function receiveRemoteChange(message) {
    if (!message || message.source === TAB_ID || !message.key || message.key.indexOf('axyp-') !== 0) return;
    var revision = Number(message.revision || 0);
    if (revision <= (localRevisions[message.key] || 0)) return;
    localRevisions[message.key] = revision;
    if (dirtyKeys[message.key] || pendingWrites.length) {
      conflicts[message.key] = { key: message.key, localValue: cache[message.key] ?? null, remoteValue: message.value ?? null, revision: revision, detectedAt: new Date().toISOString() };
      notifyConflict(conflicts[message.key]);
      return;
    }
    if (message.value === null) delete cache[message.key];
    else cache[message.key] = message.value;
    notifyChange(message.key, message.value ?? null, revision, true);
  }
  if (channel) channel.onmessage = function (event) { receiveRemoteChange(event.data); };
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('storage', function (event) { receiveRemoteChange({ key: event.key, value: event.newValue, revision: Date.now(), source: 'storage-event' }); });

  function getItem(key) {
    if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
    return readLocalStorage(key);
  }

  function broadcastChange(key, value) {
    var revision = Date.now();
    localRevisions[key] = revision;
    if (channel) channel.postMessage({ source: TAB_ID, key: key, value: value, revision: revision });
    return revision;
  }

  function getConflicts() { return Object.values(conflicts); }
  function resolveConflict(key, choice) {
    var conflict = conflicts[key];
    if (!conflict) return Promise.resolve(getStatus());
    delete conflicts[key];
    if (choice === 'remote') return setItemDurable(key, conflict.remoteValue);
    return setItemDurable(key, conflict.localValue);
  }
  function onConflict(listener) { if (typeof listener === 'function') conflictListeners.push(listener); return function () { conflictListeners = conflictListeners.filter(function (entry) { return entry !== listener; }); }; }

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

  function writeToDB(key, value, remove) {
    return openDB().then(function (db) {
      if (!db) throw lastError || makeError('Το IndexedDB δεν είναι διαθέσιμο.');
      var tx = db.transaction(STORE_NAME, 'readwrite');
      var store = tx.objectStore(STORE_NAME);
      if (remove) store.delete(key);
      else store.put(value, key);
      return transactionDone(tx).then(function () {
      });
    });
  }

  function setItem(key, value) {
    var stringValue = String(value);
    cache[key] = stringValue;
    var revision = broadcastChange(key, stringValue);
    notifyChange(key, stringValue, revision, false);
    dirtyKeys[key] = true;
    var localOk = false;
    try {
      localStorage.setItem(key, stringValue);
      localOk = true;
    } catch (error) {
      if (!indexedDBAvailable) {
        lastError = error;
      }
    }
    trackWrite(writeToDB(key, stringValue, false).catch(function (error) {
      if (localOk) return;
      throw makeError('Δεν αποθηκεύτηκαν τα δεδομένα ούτε στο IndexedDB ούτε στο localStorage.', error);
    }), key);
  }

  function setItemDurable(key, value) {
    setItem(key, value);
    return flush();
  }

  function removeItem(key) {
    delete cache[key];
    var revision = broadcastChange(key, null);
    notifyChange(key, null, revision, false);
    dirtyKeys[key] = true;
    var localOk = false;
    try {
      localStorage.removeItem(key);
      localOk = true;
    } catch (error) {
      if (!indexedDBAvailable) {
        lastError = error;
      }
    }
    trackWrite(writeToDB(key, null, true).catch(function (error) {
      if (localOk) return;
      throw makeError('Δεν διαγράφηκαν τα δεδομένα ούτε από το IndexedDB ούτε από το localStorage.', error);
    }), key);
  }

  function removeItemDurable(key) {
    removeItem(key);
    return flush();
  }

  function setItemsDurable(entries) {
    return flush().then(function () {
      if (!Array.isArray(entries) || !entries.length) throw new Error('Δεν δόθηκαν έγκυρα δεδομένα επαναφοράς.');
      var normalized = entries.map(function (entry) {
        if (!Array.isArray(entry) || typeof entry[0] !== 'string' || entry[0].indexOf('axyp-') !== 0) {
          throw new Error('Το αντίγραφο περιέχει μη επιτρεπτό κλειδί αποθήκευσης.');
        }
        return [entry[0], entry[1] === null || entry[1] === undefined ? null : String(entry[1])];
      });
      return openDB().then(function (db) {
        var committedToDb = false;
        var dbError = null;
        if (db) {
          try {
            var tx = db.transaction(STORE_NAME, 'readwrite');
            var store = tx.objectStore(STORE_NAME);
            normalized.forEach(function (entry) {
              if (entry[1] === null) store.delete(entry[0]);
              else store.put(entry[1], entry[0]);
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
            dirtyKeys[entry[0]] = true;
            if (entry[1] === null) delete cache[entry[0]];
            else cache[entry[0]] = entry[1];
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
    onChange: function (listener) { if (typeof listener !== 'function') return function () {}; changeListeners.push(listener); return function () { changeListeners = changeListeners.filter(function (entry) { return entry !== listener; }); }; },
    clearError: clearError,
    ready: ready
  };
})();
