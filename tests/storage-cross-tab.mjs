import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../storage.js', import.meta.url), 'utf8');
const channels = new Set();
class TestBroadcastChannel {
  constructor(name) { this.name = name; channels.add(this); }
  postMessage(data) {
    for (const channel of channels) {
      if (channel !== this && channel.name === this.name && typeof channel.onmessage === 'function') {
        channel.onmessage({ data: structuredClone(data) });
      }
    }
  }
  close() { channels.delete(this); }
}
function createLocalStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(key); }
  };
}
function createTab(localStorage) {
  const listeners = new Map();
  const window = {
    indexedDB: null,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatchEvent(event) {
      (listeners.get(event.type) || []).forEach((listener) => listener(event));
      return true;
    }
  };
  const context = {
    window, localStorage, indexedDB: null, navigator: {},
    BroadcastChannel: TestBroadcastChannel,
    CustomEvent: class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
  };
  vm.runInNewContext(source, context);
  return window.AXYP_STORAGE;
}

const sharedLocalStorage = createLocalStorage();
const tabA = createTab(sharedLocalStorage);
const tabB = createTab(sharedLocalStorage);
await Promise.all([tabA.ready, tabB.ready]);

let remoteEvent;
tabB.onChange((event) => { if (event.remote && event.key === 'axyp-hypotheses') remoteEvent = event; });
tabA.setItem('axyp-hypotheses', JSON.stringify([{ id: 'case-remote', title: 'Remote update' }]));
assert.ok(remoteEvent, 'A second tab receives the remote storage change event');
assert.match(tabB.getItem('axyp-hypotheses'), /case-remote/, 'A second tab refreshes its cached case data');

let localChange;
tabA.onChange((event) => { if (!event.remote && event.key === 'axyp-favorites') localChange = event; });
tabA.setItem('axyp-favorites', '[]');
assert.ok(localChange, 'Local writes also notify subscribers with remote=false');

tabA.removeItem('axyp-favorites');
assert.equal(tabB.getItem('axyp-favorites'), null, 'A remote deletion is reflected in the other tab');

tabA.flush().catch(() => {});
tabB.flush().catch(() => {});
console.log('Cross-tab storage integration tests passed.');
