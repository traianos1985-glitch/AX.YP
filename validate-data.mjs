import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./data.js', import.meta.url), 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(`${source}\nthis.DATA = DATA;`, context);
const data = context.DATA;
const errors = [];
const date = /^\d{4}-\d{2}-\d{2}$/;
const ids = new Set();
if (!date.test(data.updated) || Number.isNaN(Date.parse(data.updated))) errors.push('DATA.updated: invalid date');
for (const module of data.modules) {
  if (!module.id || !module.title) errors.push('module: missing id or title');
  if (!Array.isArray(module.items)) errors.push(`${module.id}: items must be an array`);
  for (const item of module.items || []) {
    for (const field of ['id','title','keywords','law','penalty','procedure','notes','status','source','verified']) if (!item[field]) errors.push(`${item.id || module.id}: missing ${field}`);
    if (ids.has(item.id)) errors.push(`${item.id}: duplicate id`); ids.add(item.id);
    if (!['ok','partial'].includes(item.status)) errors.push(`${item.id}: invalid status`);
    if (!date.test(item.verified) || Number.isNaN(Date.parse(item.verified))) errors.push(`${item.id}: invalid verified date`);
    try { new URL(item.source); } catch { errors.push(`${item.id}: invalid source URL`); }
    if (item.status === 'ok' && !item.source) errors.push(`${item.id}: ok entry needs a source`);
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Validated ${ids.size} entries in ${data.modules.length} modules.`);
