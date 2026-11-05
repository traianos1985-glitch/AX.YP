// Τοπική αποθήκευση με IndexedDB και μνήμη cache για ασφαλή χειρισμό μεγάλων αρχείων χωρίς όρια localStorage.
(function () {
  var DB_NAME = 'axyp-local-db';
  var STORE_NAME = 'kv';
  var dbPromise = null;
  var cache = {};

  function openDB() {
    if (!dbPromise) {
      dbPromise = new Promise(function (resolve) {
        if (!window.indexedDB) return resolve(null);
        try {
          var req = indexedDB.open(DB_NAME, 1);
          req.onupgradeneeded = function (e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME);
            }
          };
          req.onsuccess = function (e) { resolve(e.target.result); };
          req.onerror = function () { resolve(null); };
        } catch (_) {
          resolve(null);
        }
      });
    }
    return dbPromise;
  }

  var KNOWN_KEYS = [
    'axyp-hypotheses',
    'axyp-case-bundles',
    'axyp-docx-templates',
    'axyp-template-mappings',
    'axyp-favorites',
    'axyp-form-profile',
    'axyp-theme',
    'axyp-privacy',
    'axyp-narcotics-templates-seeded-v1',
    'axyp-counterfeit-templates-seeded-v1',
    'axyp-environment-templates-seeded-v1',
    'axyp-health-templates-seeded-v1'
  ];

  // Αρχική ανάγνωση από localStorage
  KNOWN_KEYS.forEach(function (k) {
    try {
      var v = localStorage.getItem(k);
      if (v !== null) cache[k] = v;
    } catch (_) {}
  });

  // Η αρχικοποίηση εκτίθεται ως Promise ώστε οι λειτουργίες που εξαρτώνται
  // από αποθηκευμένα δεδομένα να περιμένουν να ολοκληρωθεί η ανάγνωση από IndexedDB.
  var ready = openDB().then(function (db) {
    if (!db) return;
    return new Promise(function (resolve) {
      var pendingWrites = [];
      try {
        var tx = db.transaction(STORE_NAME, 'readonly');
        var store = tx.objectStore(STORE_NAME);
        KNOWN_KEYS.forEach(function (k) {
          var req = store.get(k);
          req.onsuccess = function () {
            if (req.result !== undefined && req.result !== null) {
              cache[k] = req.result;
            } else if (cache[k] !== undefined) {
              pendingWrites.push([k, cache[k]]);
            }
          };
        });
        tx.oncomplete = function () {
          if (!pendingWrites.length) return resolve();
          try {
            var writeTx = db.transaction(STORE_NAME, 'readwrite');
            var writeStore = writeTx.objectStore(STORE_NAME);
            pendingWrites.forEach(function (entry) { writeStore.put(entry[1], entry[0]); });
            writeTx.oncomplete = resolve;
            writeTx.onerror = resolve;
            writeTx.onabort = resolve;
          } catch (_) {
            resolve();
          }
        };
        tx.onerror = resolve;
        tx.onabort = resolve;
      } catch (_) {
        resolve();
      }
    });
  }).catch(function () {});

  function getItem(key) {
    if (cache[key] !== undefined) return cache[key];
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function setItem(key, value) {
    var str = String(value);
    cache[key] = str;
    openDB().then(function (db) {
      if (!db) return;
      try {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(str, key);
      } catch (err) {
        console.warn('IndexedDB write error:', err);
      }
    });
    try {
      localStorage.setItem(key, str);
    } catch (_) {
      // Σε περίπτωση υπέρβασης ορίου 5MB στο localStorage, τα δεδομένα σώζονται κανονικά στο IndexedDB
    }
  }

  function removeItem(key) {
    delete cache[key];
    try { localStorage.removeItem(key); } catch (_) {}
    openDB().then(function (db) {
      if (!db) return;
      try {
        var tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
      } catch (_) {}
    });
  }

  function clear() {
    // Διαγράφει αποκλειστικά τα δεδομένα με namespace AX.YP.
    // Δεν αγγίζει άλλα δεδομένα που ανήκουν σε άλλες εφαρμογές του ίδιου origin.
    Object.keys(cache).forEach(function (key) {
      if (key.indexOf('axyp-') === 0) delete cache[key];
    });
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var key = localStorage.key(i);
        if (key && key.indexOf('axyp-') === 0) localStorage.removeItem(key);
      }
    } catch (_) {}

    return openDB().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(STORE_NAME, 'readwrite');
          var store = tx.objectStore(STORE_NAME);
          if (typeof store.getAllKeys === 'function') {
            var request = store.getAllKeys();
            request.onsuccess = function () {
              (request.result || []).forEach(function (key) {
                if (typeof key === 'string' && key.indexOf('axyp-') === 0) store.delete(key);
              });
            };
            request.onerror = function () { resolve(); };
          } else {
            KNOWN_KEYS.forEach(function (knownKey) { store.delete(knownKey); });
          }
          tx.oncomplete = resolve;
          tx.onerror = resolve;
          tx.onabort = resolve;
        } catch (_) {
          resolve();
        }
      });
    });
  }

  function checkQuota() {
    if (navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate().then(function (est) {
        if (est.quota && est.usage && (est.quota - est.usage < 10 * 1024 * 1024)) {
          return { low: true, freeMb: Math.round((est.quota - est.usage) / (1024 * 1024)) };
        }
        return { low: false };
      }).catch(function () { return { low: false }; });
    }
    return Promise.resolve({ low: false });
  }

  
  // Αίτημα επίμονης αποθήκευσης στον browser για αποφυγή αυτόματης εκκαθάρισης
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try { navigator.storage.persist().catch(function () {}); } catch (_) {}
  }

  window.AXYP_STORAGE = {
    getItem: getItem,
    setItem: setItem,
    removeItem: removeItem,
    clear: clear,
    checkQuota: checkQuota,
    ready: ready
  };
})();
