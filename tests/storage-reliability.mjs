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
  let failNextTransactions = 0;
  const db = {
    objectStoreNames: { contains: () => true },
    transaction() {
      const tx = { error: null };
      const pending = [];
      const store = {
        get(key) {
          const request = {};
          setTimeout(() => {
            request.result = records.get(key);
            if (request.onsuccess) request.onsuccess();
          }, 0);
          return request;
        },
        put(value, key) { pending.push(['put', key, value]); },
        delete(key) { pending.push(['delete', key]); },
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
      setTimeout(() => {
        if (failNextTransactions > 0) {
          failNextTransactions -= 1;
          tx.error = new Error('Injected transient transaction failure');
          if (tx.onerror) tx.onerror();
        } else {
          pending.forEach(([operation, key, value]) => {
            if (operation === 'delete') records.delete(key);
            else records.set(key, value);
          });
          if (tx.oncomplete) tx.oncomplete();
        }
      }, 10);
      return tx;
    },
    close() {}
  };
  return {
    records,
    failNextTransaction() { failNextTransactions += 1; },
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

function loadStorage(localStorage, indexedDB, BroadcastChannelImpl) {
  const context = {
    window: { indexedDB },
    localStorage,
    indexedDB,
    BroadcastChannel: BroadcastChannelImpl,
    navigator: { storage: { estimate: () => Promise.resolve({ quota: 9 * 1024 * 1024, usage: 0 }) } },
    console
  };
  vm.runInNewContext(source, context);
  return context.window.AXYP_STORAGE;
}

// Legacy records without ordering metadata preserve the local compatibility copy.
{
  const local = createLocalStorage({ 'axyp-hypotheses': 'local-copy' });
  const idb = createIndexedDB({ 'axyp-hypotheses': 'indexed-copy' });
  const storage = loadStorage(local, idb);
  await storage.ready;
  assert.equal(storage.getItem('axyp-hypotheses'), 'local-copy');
}

// A newer versioned IndexedDB record wins over an older localStorage copy.
{
  const local = createLocalStorage({
    'axyp-hypotheses': 'local-copy',
    'axyp-storage-meta:axyp-hypotheses': JSON.stringify({ revision: 100, updatedAt: '2025-01-01T00:00:00.000Z' })
  });
  const idb = createIndexedDB({
    'axyp-hypotheses': { __axypRecord: 1, value: 'indexed-newer', revision: 200, updatedAt: '2026-01-01T00:00:00.000Z' }
  });
  const storage = loadStorage(local, idb);
  await storage.ready;
  assert.equal(storage.getItem('axyp-hypotheses'), 'indexed-newer');
}

// A newer persisted localStorage value must win over an older IndexedDB value after reload.
{
  const local = createLocalStorage({
    'axyp-hypotheses': 'local-newer',
    'axyp-storage-meta:axyp-hypotheses': JSON.stringify({ revision: 200, updatedAt: '2026-01-01T00:00:00.000Z' })
  });
  const idb = createIndexedDB({
    'axyp-hypotheses': { __axypRecord: 1, value: 'indexed-older', revision: 100, updatedAt: '2025-01-01T00:00:00.000Z' }
  });
  const storage = loadStorage(local, idb);
  await storage.ready;
  assert.equal(storage.getItem('axyp-hypotheses'), 'local-newer');
}

// A write made before hydration must not be overwritten by an older IndexedDB value.
{
  const local = createLocalStorage({ 'axyp-hypotheses': 'local-old' });
  const idb = createIndexedDB({ 'axyp-hypotheses': 'indexed-old' });
  const storage = loadStorage(local, idb);
  storage.setItem('axyp-hypotheses', 'new-value');
  await storage.flush();
  assert.equal(storage.getItem('axyp-hypotheses'), 'new-value');
  assert.equal(idb.records.get('axyp-hypotheses').value, 'new-value');
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
  // Let the failed asynchronous write settle before flush is requested.
  await new Promise((resolve) => setTimeout(resolve, 0));
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

// Backup restore batches commit together in IndexedDB and mirror to localStorage.
{
  const local = createLocalStorage({ 'axyp-theme': 'light' });
  const idb = createIndexedDB({ 'axyp-theme': 'light' });
  const storage = loadStorage(local, idb);
  await storage.ready;
  await storage.setItemsDurable([
    ['axyp-hypotheses', '[{"id":"case-1"}]'],
    ['axyp-theme', null],
    ['axyp-favorites', '[]']
  ]);
  assert.equal(idb.records.get('axyp-hypotheses').value, '[{"id":"case-1"}]');
  assert.equal(idb.records.get('axyp-theme').deleted, true);
  assert.equal(local.getItem('axyp-favorites'), '[]');
}

// A batch restore falls back to localStorage when IndexedDB cannot be opened.
{
  const local = createLocalStorage();
  const idb = createIndexedDB({}, true);
  const storage = loadStorage(local, idb);
  await storage.setItemsDurable([
    ['axyp-hypotheses', '[{"id":"fallback-case"}]'],
    ['axyp-theme', 'dark']
  ]);
  assert.equal(local.getItem('axyp-hypotheses'), '[{"id":"fallback-case"}]');
  assert.equal(local.getItem('axyp-theme'), 'dark');
}

// Modules that render or read case data wait for IndexedDB hydration first.
for (const path of ['hypotheses.js', 'case-bundles.js', 'templates.js', 'app.js']) {
  const consumer = await readFile(new URL('../' + path, import.meta.url), 'utf8');
  assert.match(consumer, /await window\.AXYP_STORAGE\.ready/, path + ' waits for storage hydration');
}
const workspaceSource = await readFile(new URL('../case-folder-storage.js', import.meta.url), 'utf8');
assert.match(workspaceSource, /async function restore\(\)[\s\S]*?await window\.AXYP_STORAGE\.ready/);

// Degraded state clears only after every failed key has been successfully retried.
{
  const local = createLocalStorage({}, true);
  const idb = createIndexedDB();
  const storage = loadStorage(local, idb);
  await storage.ready;

  idb.failNextTransaction();
  idb.failNextTransaction();
  storage.setItem('axyp-first', 'first-attempt');
  storage.setItem('axyp-second', 'second-attempt');
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(storage.getStatus().degraded, true);

  storage.setItem('axyp-first', 'first-retry');
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(storage.getStatus().degraded, true, 'A successful retry for one key must not hide another key failure');
  await assert.rejects(storage.flush(), /Η αποθήκευση δεν επιβεβαιώθηκε/);

  storage.setItem('axyp-second', 'second-retry');
  const status = await storage.flush();
  assert.equal(status.degraded, false, 'Storage should recover after the failed key is retried successfully');
  assert.equal(idb.records.get('axyp-first').value, 'first-retry');
  assert.equal(idb.records.get('axyp-second').value, 'second-retry');
}


function createBroadcastChannelHub() {
  const channels = new Map();
  return class FakeBroadcastChannel {
    constructor(name) {
      this.name = name;
      if (!channels.has(name)) channels.set(name, new Set());
      channels.get(name).add(this);
    }
    postMessage(data) {
      for (const peer of channels.get(this.name) || []) {
        if (peer !== this) setTimeout(() => peer.onmessage?.({ data }), 0);
      }
    }
    close() { channels.get(this.name)?.delete(this); }
  };
}

// A failed IndexedDB delete must leave a durable tombstone so stale data cannot reappear after restart.
{
  const local = createLocalStorage({
    'axyp-hypotheses': 'old-case-data',
    'axyp-storage-meta:axyp-hypotheses': JSON.stringify({ revision: 100, deleted: false, source: 'old-tab' })
  });
  const idb = createIndexedDB({
    'axyp-hypotheses': { __axypRecord: 1, value: 'old-case-data', deleted: false, revision: 100, source: 'old-tab' }
  });
  const storage = loadStorage(local, idb);
  await storage.ready;
  idb.failNextTransaction();
  await storage.removeItemDurable('axyp-hypotheses');
  assert.equal(local.getItem('axyp-hypotheses'), null);
  assert.equal(JSON.parse(local.getItem('axyp-storage-meta:axyp-hypotheses')).deleted, true);
  const reloaded = loadStorage(local, idb);
  await reloaded.ready;
  assert.equal(reloaded.getItem('axyp-hypotheses'), null, 'a deleted key must not be resurrected from stale IndexedDB data');
  assert.equal(idb.records.get('axyp-hypotheses').deleted, true, 'hydration repairs the stale IndexedDB record with the tombstone');
}

// Two independent storage instances receive updates and surface same-key concurrent writes.
{
  const Channel = createBroadcastChannelHub();
  const local = createLocalStorage();
  const idb = createIndexedDB();
  const tabA = loadStorage(local, idb, Channel);
  const tabB = loadStorage(local, idb, Channel);
  await Promise.all([tabA.ready, tabB.ready]);
  let remoteEvent = null;
  let conflictEvent = null;
  tabB.onChange((event) => { if (event.remote && event.key === 'axyp-hypotheses') remoteEvent = event; });
  tabB.onConflict((event) => { if (event.key === 'axyp-hypotheses') conflictEvent = event; });
  await tabA.setItemDurable('axyp-hypotheses', 'from-tab-a');
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(tabB.getItem('axyp-hypotheses'), 'from-tab-a');
  assert.equal(remoteEvent.value, 'from-tab-a');
  await tabA.removeItemDurable('axyp-hypotheses');
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(tabB.getItem('axyp-hypotheses'), null, 'remote deletions are propagated to the other tab');
  await tabA.setItemDurable('axyp-hypotheses', 'before-conflict');
  await new Promise((resolve) => setTimeout(resolve, 5));

  tabB.setItem('axyp-hypotheses', 'unsaved-tab-b');
  tabA.setItem('axyp-hypotheses', 'newer-tab-a');
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(conflictEvent, 'simultaneous edits of the same key are surfaced as a conflict');
  await assert.rejects(tabB.flush(), /ανεπίλυτες αλλαγές/);
  await tabB.resolveConflict('axyp-hypotheses', 'remote');
  assert.equal(tabB.getItem('axyp-hypotheses'), 'newer-tab-a');
  assert.equal((await tabB.flush()).degraded, false);
}

console.log('Storage reliability tests passed.');
