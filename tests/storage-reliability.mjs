import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../storage.js', import.meta.url), 'utf8');

function createLocalStorage(initial = {}, shouldThrow = false) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    getItem(key) {
      if (shouldThrow) throw new Error('localStorage blocked');
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (shouldThrow) throw new Error('localStorage blocked');
      values.set(String(key), String(value));
    },
    removeItem(key) {
      if (shouldThrow) throw new Error('localStorage blocked');
      values.delete(key);
    },
    values
  };
}

function createIndexedDB(seed = {}, shouldFail = false) {
  const records = new Map(Object.entries(seed));
  const db = {
    objectStoreNames: { contains: () => true },
    transaction() {
      const tx = { error: null };
      const store = {
        get(key) {
          const request = {};
          setTimeout(() => {
            request.result = records.get(key);
            if (request.onsuccess) request.onsuccess();
          }, 0);
          return request;
        },
        put(value, key) { records.set(key, value); },
        delete(key) { records.delete(key); },
        getAllKeys() {
          const request = {};
          setTimeout(() => {
            request.result = Array.from(records.keys());
            if (request.onsuccess) request.onsuccess();
          }, 0);
          return request;
        }
      };
      tx.objectStore = () => store;
      setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 10);
      return tx;
    },
    close() {}
  };
  return {
    records,
    open() {
      const request = {};
      setTimeout(() => {
        if (shouldFail) {
          request.error = new Error('IndexedDB unavailable');
          if (request.onerror) request.onerror();
        } else {
          request.result = db;
          if (request.onsuccess) request.onsuccess({ target: { result: db } });
        }
      }, 0);
      return request;
    }
  };
}

function loadStorage(localStorage, indexedDB) {
  const context = {
    window: { indexedDB },
    localStorage,
    indexedDB,
    navigator: { storage: { estimate: () => Promise.resolve({ quota: 9 * 1024 * 1024, usage: 0 }) } },
    console
  };
  vm.runInNewContext(source, context);
  return context.window.AXYP_STORAGE;
}

// IndexedDB hydration wins over the localStorage compatibility copy.
{
  const local = createLocalStorage({ 'axyp-hypotheses': 'local-copy' });
  const idb = createIndexedDB({ 'axyp-hypotheses': 'indexed-copy' });
  const storage = loadStorage(local, idb);
  await storage.ready;
  assert.equal(storage.getItem('axyp-hypotheses'), 'indexed-copy');
}

// A write made before hydration must not be overwritten by an older IndexedDB value.
{
  const local = createLocalStorage({ 'axyp-hypotheses': 'local-old' });
  const idb = createIndexedDB({ 'axyp-hypotheses': 'indexed-old' });
  const storage = loadStorage(local, idb);
  storage.setItem('axyp-hypotheses', 'new-value');
  await storage.flush();
  assert.equal(storage.getItem('axyp-hypotheses'), 'new-value');
  assert.equal(idb.records.get('axyp-hypotheses'), 'new-value');
}

// localStorage remains a valid fallback if IndexedDB fails.
{
  const local = createLocalStorage();
  const idb = createIndexedDB({}, true);
  const storage = loadStorage(local, idb);
  await storage.setItemDurable('axyp-hypotheses', 'fallback-value');
  assert.equal(local.getItem('axyp-hypotheses'), 'fallback-value');
  assert.equal(storage.getItem('axyp-hypotheses'), 'fallback-value');
}

// If both persistence backends fail, flush must reject instead of reporting success.
{
  const local = createLocalStorage({}, true);
  const storage = loadStorage(local, null);
  storage.setItem('axyp-hypotheses', 'memory-only');
  await assert.rejects(storage.flush(), /Δεν αποθηκεύτηκαν τα δεδομένα/);
  assert.equal(storage.getItem('axyp-hypotheses'), 'memory-only');
}

// Clearing AX.YP data must preserve unrelated keys in the same browser origin.
{
  const local = createLocalStorage({
    'axyp-hypotheses': 'case-data',
    'axyp-theme': 'dark',
    'another-app-setting': 'keep-me'
  });
  const storage = loadStorage(local, null);
  await storage.clear();
  assert.equal(local.getItem('axyp-hypotheses'), null);
  assert.equal(local.getItem('axyp-theme'), null);
  assert.equal(local.getItem('another-app-setting'), 'keep-me');
}

// Zero usage is valid quota information; low free space is still detected.
{
  const local = createLocalStorage();
  const storage = loadStorage(local, null);
  const quota = await storage.checkQuota();
  assert.equal(quota.low, true);
  assert.equal(quota.freeMb, 9);
}

console.log('Storage reliability tests passed.');
