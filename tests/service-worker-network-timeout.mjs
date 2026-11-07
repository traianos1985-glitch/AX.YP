import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

async function runFetch({ request, cachedResponse, cachedIndex }) {
  let fetchHandler;
  let timeoutCallback;
  let aborted = false;
  const cache = { put: async () => {}, addAll: async () => {} };
  const self = {
    location: { origin: 'https://axyp.test' },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener(type, handler) {
      if (type === 'fetch') fetchHandler = handler;
    }
  };
  const caches = {
    open: async () => cache,
    keys: async () => ['axyp-v35', 'axyp-v36'],
    delete: async () => true,
    match: async (key) => {
      const url = typeof key === 'string' ? key : key.url;
      if (url.endsWith('/index.html')) return cachedIndex || undefined;
      return cachedResponse || undefined;
    }
  };
  const context = {
    self,
    caches,
    URL,
    Promise,
    Response,
    AbortController,
    fetch: (_request, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        aborted = true;
        reject(new Error('network request aborted'));
      });
    }),
    setTimeout(callback, delay) {
      const expectedDelay = /\/dossier-packages\/[^/]+\.axyp\.zip$/u.test(new URL(request.url).pathname) ? 60000 : 3000;
      assert.equal(delay, expectedDelay, 'ordinary assets retain the short timeout while published dossier packages get a longer download window');
      timeoutCallback = callback;
      return 1;
    },
    clearTimeout() {}
  };
  vm.runInNewContext(source, context, { filename: 'sw.js' });
  let responsePromise;
  fetchHandler({
    request,
    respondWith(promise) { responsePromise = promise; }
  });
  assert.equal(typeof timeoutCallback, 'function', 'network timeout should be scheduled');
  timeoutCallback();
  const response = await responsePromise;
  return { response, aborted };
}

const cachedAsset = new Response('cached asset', { status: 200 });
const assetResult = await runFetch({
  request: { method: 'GET', url: 'https://axyp.test/app.js', mode: 'cors' },
  cachedResponse: cachedAsset
});
assert.equal(assetResult.aborted, true, 'stalled network request should be aborted');
assert.equal(await assetResult.response.text(), 'cached asset', 'cached asset should be returned after timeout');

const cachedPackage = new Response('cached dossier package', { status: 200 });
const packageResult = await runFetch({
  request: { method: 'GET', url: 'https://axyp.test/dossier-packages/axyp-generic-official-package.axyp.zip', mode: 'cors' },
  cachedResponse: cachedPackage
});
assert.equal(packageResult.aborted, true, 'stalled published package download should be aborted only after the extended timeout');
assert.equal(await packageResult.response.text(), 'cached dossier package', 'cached dossier package should be returned after timeout');

const cachedIndex = new Response('cached app shell', { status: 200 });
const navigationResult = await runFetch({
  request: { method: 'GET', url: 'https://axyp.test/case/123', mode: 'navigate' },
  cachedIndex
});
assert.equal(navigationResult.aborted, true);
assert.equal(await navigationResult.response.text(), 'cached app shell', 'navigation should fall back to cached index.html');

console.log('Service-worker network-timeout fallback tests passed.');
