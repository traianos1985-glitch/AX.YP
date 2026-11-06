import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const baseUrl = 'http://127.0.0.1:4173';
const chromePath = process.env.CHROME_BIN || 'google-chrome';
const profileDir = await mkdtemp(path.join(os.tmpdir(), 'axyp-browser-'));
const server = spawn(process.execPath, [
  'node_modules/vite/bin/vite.js', 'preview',
  '--host', '127.0.0.1', '--port', '4173', '--strictPort'
], { stdio: 'ignore' });
let chrome;
let socket;
const pending = new Map();
const pageErrors = [];
let nextId = 0;

async function waitUntil(test, label, timeout = 20000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeout) {
    try {
      const value = await test();
      if (value) return value;
    } catch (error) { lastError = error; }
    await delay(150);
  }
  throw new Error('Timed out waiting for ' + label + (lastError ? ': ' + lastError.message : ''));
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error('Chrome DevTools connection timed out')), 10000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(ws); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Chrome DevTools connection failed')); }, { once: true });
  });
}

function command(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('CDP command timed out: ' + method));
    }, 15000);
    pending.set(id, { resolve, reject, timer, method });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Browser evaluation failed');
  }
  return result.result?.value;
}

async function waitForExpression(expression, label, timeout = 20000) {
  return waitUntil(async () => {
    const value = await evaluate(expression);
    return value ? value : false;
  }, label, timeout);
}

async function setValue(selector, value) {
  const encoded = JSON.stringify(String(value));
  const result = await evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    if (!field) return false;
    field.value = ${encoded};
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  assert.equal(result, true, 'Expected form field ' + selector);
}

async function click(selector, label = selector) {
  const result = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    element.click();
    return true;
  })()`);
  assert.equal(result, true, 'Could not click ' + label);
}

async function openCases() {
  await click('#cases-mode', 'Cases mode');
  await waitForExpression("!document.getElementById('cases-panel').hidden", 'cases workspace');
}

try {
  await waitUntil(async () => {
    const response = await fetch(baseUrl);
    return response.ok;
  }, 'Vite preview server');

  chrome = spawn(chromePath, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
    '--remote-allow-origins=*', '--user-data-dir=' + profileDir, 'about:blank'
  ], { stdio: 'ignore' });

  const devtoolsPort = await waitUntil(async () => {
    try {
      const active = await readFile(path.join(profileDir, 'DevToolsActivePort'), 'utf8');
      const port = Number(active.split('\\n')[0]);
      return Number.isInteger(port) && port > 0 ? port : false;
    } catch { return false; }
  }, 'Chrome DevTools port');
  const devtoolsBase = 'http://127.0.0.1:' + devtoolsPort;
  const version = await waitUntil(async () => {
    const response = await fetch(devtoolsBase + '/json/version');
    return response.ok ? response.json() : false;
  }, 'Chrome DevTools endpoint');
  assert.ok(version.webSocketDebuggerUrl);

  const targetResponse = await fetch(devtoolsBase + '/json/new?about:blank', { method: 'PUT' });
  assert.ok(targetResponse.ok, 'Chrome must create a browser tab');
  const target = await targetResponse.json();
  socket = await connectCdp(target.webSocketDebuggerUrl);
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      pageErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    }
    if (!message.id) return;
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    clearTimeout(item.timer);
    if (message.error) item.reject(new Error(item.method + ': ' + message.error.message));
    else item.resolve(message.result || {});
  });

  await command('Page.enable');
  await command('Runtime.enable');
  await command('Page.navigate', { url: baseUrl });
  await waitForExpression("document.readyState === 'complete' && !!window.AXYP_STORAGE", 'application startup');
  await evaluate('window.AXYP_STORAGE.ready');

  // Create a real case through the rendered category dashboard and guided form.
  await openCases();
  await evaluate(`(() => {
    const category = [...document.querySelectorAll('.dossier-category')]
      .find((card) => card.querySelector('h3')?.textContent.includes('Ναρκωτικά'));
    if (!category) return false;
    const create = [...category.querySelectorAll('button')]
      .find((button) => button.textContent.includes('Νέα υπόθεση'));
    if (!create) return false;
    create.click();
    return true;
  })()`).then((value) => assert.equal(value, true, 'Narcotics category must offer new-case creation'));
  await waitForExpression("!document.getElementById('case-form').hidden", 'new case form');

  await setValue('#case-title', 'E2E TEST CASE — LOCAL ONLY');
  await setValue('#case-offence', 'E2E TEST OFFENCE');
  await setValue('#case-protocol-number', 'E2E-2026-0001');
  await setValue('#case-location', 'E2E TEST LOCATION');
  await setValue('#case-incident-date', '2026-11-06');
  await setValue('#case-incident-time', '21:30');

  await click('#case-workflow-step-1 .case-workflow-controls button.primary', 'Continue to people and evidence');
  await waitForExpression("!document.getElementById('case-workflow-step-2').hidden", 'second workflow step');

  await click('#person-register-add', 'Add person');
  await setValue('#person-register-list [data-field="fullName"]', 'E2E TEST PERSON');
  await setValue('#person-register-list [data-field="idNumber"]', 'E2E-TEST-ID');
  await click('#evidence-register-add', 'Add evidence');
  await setValue('#evidence-register-list [data-field="description"]', 'E2E TEST EVIDENCE');
  await setValue('#evidence-register-list [data-field="quantity"]', '2');
  await setValue('#evidence-register-list [data-field="unit"]', 'τεμάχια');
  await click('#task-register-add', 'Add pending action');
  await setValue('#task-register-list [data-field="title"]', 'E2E TEST PENDING ACTION');
  await setValue('#task-register-list [data-field="assignedTo"]', 'E2E TEST OFFICER');

  await click('#case-workflow-step-2 .case-workflow-controls button.primary', 'Continue to review');
  await waitForExpression("!document.getElementById('case-workflow-step-3').hidden", 'review step');
  await click('#case-form button[type="submit"]', 'Save case');

  const saved = await waitForExpression(`(() => {
    const rows = JSON.parse(window.AXYP_STORAGE.getItem('axyp-hypotheses') || '[]');
    return rows.find((item) => item.title === 'E2E TEST CASE — LOCAL ONLY');
  })()`, 'durably saved case');
  assert.equal(saved.profile, 'narcotics');
  assert.equal(saved.protocolNumber, 'E2E-2026-0001');
  assert.equal(saved.caseRegister.persons.length, 1);
  assert.equal(saved.caseRegister.persons[0].fullName, 'E2E TEST PERSON');
  assert.equal(saved.caseRegister.evidence[0].description, 'E2E TEST EVIDENCE');
  assert.equal(saved.caseRegister.actions[0].title, 'E2E TEST PENDING ACTION');

  // Reload the actual production build and verify that the saved case and register hydrate again.
  await command('Page.reload', { ignoreCache: true });
  await waitForExpression("document.readyState === 'complete' && !!window.AXYP_STORAGE", 'application reload');
  await evaluate('window.AXYP_STORAGE.ready');
  await openCases();
  await evaluate(`(() => {
    const category = [...document.querySelectorAll('.dossier-category')]
      .find((card) => card.querySelector('h3')?.textContent.includes('Ναρκωτικά'));
    if (!category) return false;
    category.querySelector('button')?.click();
    return true;
  })()`).then((value) => assert.equal(value, true, 'Narcotics category must reopen'));
  await waitForExpression("[...document.querySelectorAll('.case-card')].some((card) => card.textContent.includes('E2E TEST CASE'))", 'saved case card');
  await evaluate(`(() => {
    const card = [...document.querySelectorAll('.case-card')]
      .find((node) => node.textContent.includes('E2E TEST CASE'));
    card?.click();
    return !!card;
  })()`).then((value) => assert.equal(value, true, 'Saved case card must be selectable'));
  await waitForExpression("document.getElementById('case-title').value === 'E2E TEST CASE — LOCAL ONLY'", 'reopened case form');
  const reopened = await evaluate(`(() => ({
    protocol: document.getElementById('case-protocol-number').value,
    person: document.querySelector('#person-register-list [data-field="fullName"]')?.value,
    evidence: document.querySelector('#evidence-register-list [data-field="description"]')?.value,
    action: document.querySelector('#task-register-list [data-field="title"]')?.value,
    registerCounts: [
      document.querySelectorAll('#person-register-list .case-register-entry').length,
      document.querySelectorAll('#evidence-register-list .case-register-entry').length,
      document.querySelectorAll('#task-register-list .case-register-entry').length
    ]
  }))()`);
  assert.deepEqual(reopened, {
    protocol: 'E2E-2026-0001',
    person: 'E2E TEST PERSON',
    evidence: 'E2E TEST EVIDENCE',
    action: 'E2E TEST PENDING ACTION',
    registerCounts: [1, 1, 1]
  });

  // Inspect the generated full backup Blob without writing test data to an external service.
  await evaluate(`(() => {
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { window.__axypE2EBackupBlob = blob; return original(blob); };
  })()`);
  await click('#full-backup', 'Create full local backup');
  const backupText = await waitForExpression("window.__axypE2EBackupBlob ? window.__axypE2EBackupBlob.text() : ''", 'full backup generation');
  const backup = JSON.parse(backupText);
  assert.equal(backup.schema, 2);
  const backupCase = backup.hypotheses.find((item) => item.title === 'E2E TEST CASE — LOCAL ONLY');
  assert.ok(backupCase, 'Full backup must include the saved case');
  assert.equal(backupCase.caseRegister.persons[0].fullName, 'E2E TEST PERSON');

  assert.deepEqual(pageErrors, [], 'The browser must not report uncaught JavaScript exceptions');
  console.log('Browser case lifecycle E2E passed: category creation, guided entry, register persistence, reload/reopen and full backup.');
} finally {
  if (socket) socket.close();
  if (chrome && !chrome.killed) chrome.kill('SIGTERM');
  if (!server.killed) server.kill('SIGTERM');
  await rm(profileDir, { recursive: true, force: true });
}
