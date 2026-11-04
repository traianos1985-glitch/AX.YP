import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./data.js', import.meta.url), 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(`${source}\nthis.DATA = window.DATA;`, context);
const urls = [...new Set(context.DATA.modules.flatMap((module) => module.items || []).map((item) => item.source))];
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const ATTEMPTS = 2;
const CONCURRENCY = 5;
const failures = [];
const warnings = [];

async function checkUrl(url) {
  let lastProblem = 'request failed';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(12000),
      });
      await response.body?.cancel();
      if (response.status === 404 || response.status === 410) return { failure: `${url}: ${response.status}` };
      if (response.ok) return {};
      lastProblem = `HTTP ${response.status}`;
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : 'request failed';
    }
    if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
  return { warning: `${url}: ${lastProblem}` };
}

let nextIndex = 0;
async function worker() {
  while (nextIndex < urls.length) {
    const url = urls[nextIndex++];
    const result = await checkUrl(url);
    if (result.failure) failures.push(result.failure);
    if (result.warning) warnings.push(result.warning);
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));

if (warnings.length) console.warn(`Could not verify (not counted as broken):\n${warnings.join('\n')}`);

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Checked ${urls.length} source links.`);
