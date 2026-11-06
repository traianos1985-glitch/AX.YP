// Τοπική αποθήκευση AX.YP με IndexedDB, συμβατό σύγχρονο API και ρητή επιβεβαίωση εγγραφών.
(function () {
  'use strict';

  var DB_NAME = 'axyp-local-db';
  var STORE_NAME = 'kv';
  var dbPromise = null;
  var cache = Object.create(null);
  var dirtyKeys = Object.create(null);
  var pendingWrites = [];
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
          var req = indexedDB.open(DB_NAME, 1);
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

  var ready = openDB().then(function (db) {
    if (!db) return getStatus();
    return new Promise(function (resolve) {
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
    });
  }).catch(function (error) {
    lastError = error;
    return getStatus();
  });

  function getStatus() {
    return {
      indexedDBAvailable: indexedDBAvailable,
      degraded: !!lastError,
      error: lastError ? String(lastError.message || lastError) : null
    };
  }

  function getItem(key) {
    if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
    return readLocalStorage(key);
  }

  function trackWrite(operation) {
    var tracked = Promise.resolve(operation).then(function () {
      return { ok: true };
    }).catch(function (error) {
      lastError = error;
      return { ok: false, error: error };
    });
    pendingWrites.push(tracked);
    tracked.then(function () {
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
      return transactionDone(tx);
    });
  }

  function setItem(key, value) {
    var stringValue = String(value);
    cache[key] = stringValue;
    dirtyKeys[key] = true;
    var localOk = false;
    try {
      localStorage.setItem(key, stringValue);
      localOk = true;
    } catch (error) {
      lastError = error;
    }
    trackWrite(writeToDB(key, stringValue, false).catch(function (error) {
      if (localOk) return;
      throw makeError('Δεν αποθηκεύτηκαν τα δεδομένα ούτε στο IndexedDB ούτε στο localStorage.', error);
    }));
  }

  function setItemDurable(key, value) {
    setItem(key, value);
    return flush();
  }

  function removeItem(key) {
    delete cache[key];
    dirtyKeys[key] = true;
    var localOk = false;
    try {
      localStorage.removeItem(key);
      localOk = true;
    } catch (error) {
      lastError = error;
    }
    trackWrite(writeToDB(key, null, true).catch(function (error) {
      if (localOk) return;
      throw makeError('Δεν διαγράφηκαν τα δεδομένα ούτε από το IndexedDB ούτε από το localStorage.', error);
    }));
  }

  function removeItemDurable(key) {
    removeItem(key);
    return flush();
  }

  function flush() {
    return ready.then(function () {
      var tasks = pendingWrites.slice();
      return Promise.all(tasks).then(function (results) {
        var failed = results.find(function (result) { return !result.ok; });
        if (failed) throw makeError('Η αποθήκευση δεν επιβεβαιώθηκε: ' + (failed.error.message || failed.error), failed.error);
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
    removeItem: removeItem,
    removeItemDurable: removeItemDurable,
    clear: clear,
    flush: flush,
    checkQuota: checkQuota,
    getStatus: getStatus,
    ready: ready
  };
})();
