import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const baseUrl = 'http://127.0.0.1:4174';
const driverUrl = 'http://127.0.0.1:4444';
const server = spawn(process.execPath, [
  'node_modules/vite/bin/vite.js', 'preview',
  '--host', '127.0.0.1', '--port', '4174', '--strictPort'
], { stdio: 'ignore' });
const driver = spawn('geckodriver', ['--host', '127.0.0.1', '--port', '4444'], { stdio: 'ignore' });
let sessionId;

async function waitUntil(test, label, timeout = 30000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeout) {
    try {
      const value = await test();
      if (value) return value;
    } catch (error) { lastError = error; }
    await delay(200);
  }
  throw new Error('Timed out waiting for ' + label + (lastError ? ': ' + lastError.message : ''));
}

async function request(path, method = 'GET', body) {
  const response = await fetch(driverUrl + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.value?.error) {
    throw new Error(payload.value?.message || payload.message || ('WebDriver ' + method + ' ' + path + ' failed: ' + response.status));
  }
  if (path === '/session' && method === 'POST') {
    return { ...payload.value, sessionId: payload.sessionId || payload.value?.sessionId };
  }
  return payload.value;
}

async function execute(expression) {
  const result = await request('/session/' + sessionId + '/execute/sync', 'POST', {
    script: 'return (' + expression + ');',
    args: []
  });
  return result;
}

async function waitForExpression(expression, label, timeout = 30000) {
  return waitUntil(async () => {
    const value = await execute(expression);
    return value ? value : false;
  }, label, timeout);
}

async function click(selector, label = selector) {
  const result = await execute(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    element.click();
    return true;
  })()`);
  assert.equal(result, true, 'Could not click ' + label);
}

async function setValue(selector, value) {
  const result = await execute(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    if (!field) return false;
    field.value = ${JSON.stringify(String(value))};
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  assert.equal(result, true, 'Expected form field ' + selector);
}

async function openCases() {
  await click('#cases-mode', 'Cases mode');
  await waitForExpression("!document.getElementById('cases-panel').hidden", 'cases workspace');
}

try {
  await waitUntil(async () => (await fetch(baseUrl)).ok, 'Vite preview server');
  await waitUntil(async () => {
    const response = await fetch(driverUrl + '/status');
    if (!response.ok) return false;
    const status = await response.json();
    return status.value?.ready === true;
  }, 'GeckoDriver');

  const created = await request('/session', 'POST', {
    capabilities: {
      alwaysMatch: {
        browserName: 'firefox',
        'moz:firefoxOptions': { args: ['-headless'] }
      }
    }
  });
  sessionId = created.sessionId;
  assert.ok(sessionId, 'Firefox WebDriver session must start');

  await request('/session/' + sessionId + '/url', 'POST', { url: baseUrl });
  await waitForExpression("document.readyState === 'complete' && window.__AXYP_APP_READY === true && !!window.AXYP_STORAGE && !!window.AXYP_STORAGE.ready && typeof window.AXYP_STORAGE.ready.then === 'function'", 'Firefox application startup');
  await request('/session/' + sessionId + '/execute/async', 'POST', {
    script: 'const done = arguments[arguments.length - 1]; Promise.resolve(window.AXYP_STORAGE.ready).then(() => done(true), error => done({ error: String(error) }));',
    args: []
  });

  await openCases();
  const categoryOpened = await execute(`(() => {
    const category = [...document.querySelectorAll('.dossier-category')]
      .find((card) => card.querySelector('h3')?.textContent.includes('Ναρκωτικά'));
    const create = [...(category?.querySelectorAll('button') || [])]
      .find((button) => button.textContent.includes('Νέα υπόθεση'));
    create?.click();
    return !!create;
  })()`);
  assert.equal(categoryOpened, true, 'Narcotics category must offer new-case creation');
  await waitForExpression("!document.getElementById('case-form').hidden", 'Firefox new case form');

  await setValue('#case-title', 'FIREFOX E2E TEST CASE — LOCAL ONLY');
  await setValue('#case-offence', 'FIREFOX E2E TEST OFFENCE');
  await setValue('#case-protocol-number', 'FF-E2E-2026-0001');
  await setValue('#case-location', 'FIREFOX E2E TEST LOCATION');
  await setValue('#case-incident-date', '2026-11-06');
  await setValue('#case-incident-time', '21:30');

  await click('#case-workflow-step-1 .case-workflow-controls button.primary', 'Continue to register');
  await waitForExpression("!document.getElementById('case-workflow-step-2').hidden", 'Firefox second workflow step');
  await click('#person-register-add', 'Add person in Firefox');
  await setValue('#person-register-list [data-field="fullName"]', 'FIREFOX E2E TEST PERSON');
  await setValue('#person-register-list [data-field="idNumber"]', 'FF-E2E-ID');
  await click('#evidence-register-add', 'Add evidence in Firefox');
  await setValue('#evidence-register-list [data-field="description"]', 'FIREFOX E2E TEST EVIDENCE');
  await setValue('#evidence-register-list [data-field="quantity"]', '3');
  await setValue('#evidence-register-list [data-field="unit"]', 'τεμάχια');
  await click('#task-register-add', 'Add action in Firefox');
  await setValue('#task-register-list [data-field="title"]', 'FIREFOX E2E TEST ACTION');
  await setValue('#task-register-list [data-field="assignedTo"]', 'FIREFOX E2E TEST OFFICER');

  await click('#case-workflow-step-2 .case-workflow-controls button.primary', 'Continue to review in Firefox');
  await waitForExpression("!document.getElementById('case-workflow-step-3').hidden", 'Firefox review step');
  await click('#case-form button[type="submit"]', 'Save case in Firefox');

  const saved = await waitForExpression(`(() => {
    const rows = JSON.parse(window.AXYP_STORAGE.getItem('axyp-hypotheses') || '[]');
    return rows.find((item) => item.title === 'FIREFOX E2E TEST CASE — LOCAL ONLY');
  })()`, 'Firefox locally saved case');
  assert.equal(saved.profile, 'narcotics');
  assert.equal(saved.protocolNumber, 'FF-E2E-2026-0001');
  assert.equal(saved.caseRegister.persons[0].fullName, 'FIREFOX E2E TEST PERSON');
  assert.equal(saved.caseRegister.evidence[0].description, 'FIREFOX E2E TEST EVIDENCE');
  assert.equal(saved.caseRegister.actions[0].title, 'FIREFOX E2E TEST ACTION');

  await request('/session/' + sessionId + '/refresh', 'POST', {});
  await waitForExpression("document.readyState === 'complete' && window.__AXYP_APP_READY === true && !!window.AXYP_STORAGE && !!window.AXYP_STORAGE.ready && typeof window.AXYP_STORAGE.ready.then === 'function'", 'Firefox page reload');
  await request('/session/' + sessionId + '/execute/async', 'POST', {
    script: 'const done = arguments[arguments.length - 1]; Promise.resolve(window.AXYP_STORAGE.ready).then(() => done(true), error => done({ error: String(error) }));',
    args: []
  });
  const afterReload = await execute(`(() => {
    const rows = JSON.parse(window.AXYP_STORAGE.getItem('axyp-hypotheses') || '[]');
    const item = rows.find((row) => row.title === 'FIREFOX E2E TEST CASE — LOCAL ONLY');
    return item ? {
      protocol: item.protocolNumber,
      person: item.caseRegister.persons[0]?.fullName,
      evidence: item.caseRegister.evidence[0]?.description,
      action: item.caseRegister.actions[0]?.title
    } : null;
  })()`);
  assert.deepEqual(afterReload, {
    protocol: 'FF-E2E-2026-0001',
    person: 'FIREFOX E2E TEST PERSON',
    evidence: 'FIREFOX E2E TEST EVIDENCE',
    action: 'FIREFOX E2E TEST ACTION'
  });

  console.log('Firefox case lifecycle E2E passed: create, register, local save and reload.');
} finally {
  if (sessionId) {
    await request('/session/' + sessionId, 'DELETE').catch(() => {});
  }
  for (const child of [driver, server]) {
    if (!child || child.exitCode !== null || child.signalCode !== null) continue;
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('close', resolve)),
      delay(5000)
    ]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
}
