import fs from 'node:fs';
import vm from 'node:vm';

const MIN_ENTRIES = 30;

const source = fs.readFileSync(new URL('./data.js', import.meta.url), 'utf8');
const context = {};
vm.createContext(context);
try {
  vm.runInContext(`${source}\nthis.DATA = DATA;`, context);
} catch (error) {
  console.error(`data.js: could not load the database (${error.message})`);
  process.exit(1);
}
const data = context.DATA;
if (!data || !Array.isArray(data.modules) || data.modules.length === 0) {
  console.error('data.js: DATA.modules is missing or empty');
  process.exit(1);
}
const errors = [];
const date = /^\d{4}-\d{2}-\d{2}$/;
const ids = new Set();
const moduleIds = new Set();
const OFFICIAL_HOSTS = ['et.gr', 'gov.gr'];
const isOfficial = (url) => OFFICIAL_HOSTS.some((host) => new URL(url).hostname.endsWith(host));

if (!date.test(data.updated) || Number.isNaN(Date.parse(data.updated))) errors.push('DATA.updated: invalid date');
for (const module of data.modules) {
  if (!module.id || !module.title) errors.push('module: missing id or title');
  if (moduleIds.has(module.id)) errors.push(`${module.id}: duplicate module id`);
  moduleIds.add(module.id);
  if (!Array.isArray(module.items)) errors.push(`${module.id}: items must be an array`);
  for (const item of module.items || []) {
    for (const field of ['id', 'title', 'keywords', 'law', 'penalty', 'procedure', 'notes', 'status', 'source', 'verified']) {
      if (!item[field]) errors.push(`${item.id || module.id}: missing ${field}`);
    }
    if (ids.has(item.id)) errors.push(`${item.id}: duplicate id`);
    ids.add(item.id);
    if (!['ok', 'partial'].includes(item.status)) errors.push(`${item.id}: invalid status`);
    if (!date.test(item.verified) || Number.isNaN(Date.parse(item.verified))) errors.push(`${item.id}: invalid verified date`);
    try {
      new URL(item.source);
      if (item.status === 'ok' && !isOfficial(item.source)) errors.push(`${item.id}: ok entry needs an official source (et.gr or gov.gr)`);
    } catch {
      errors.push(`${item.id}: invalid source URL`);
    }
  }
}
if (ids.size < MIN_ENTRIES) {
  errors.push(`database has ${ids.size} entries, expected at least ${MIN_ENTRIES}: check that data.js was not truncated`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Validated ${ids.size} entries in ${data.modules.length} modules.`);
