import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./data.js', import.meta.url), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(`${source}\nthis.DATA = DATA;`, context);
const urls = [...new Set(context.DATA.modules.flatMap((module) => module.items || []).map((item) => item.source))];
const failures = [];

for (const url of urls) {
  try {
    const response = await fetch(url, { redirect: 'follow' });
    if (response.status === 404) failures.push(`${url}: 404`);
  } catch (error) {
    failures.push(`${url}: ${error instanceof Error ? error.message : 'request failed'}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Checked ${urls.length} source links.`);
