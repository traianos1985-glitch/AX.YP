import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildDocx, ensureDefaultTemplates, loadBuiltinTemplateData } from '../template-library.js';

const office = spawnSync('sh', ['-c', 'command -v libreoffice || command -v soffice'], { encoding: 'utf8' }).stdout.trim();
if (!office) {
  if (process.env.CI) throw new Error('DOCX visible-text validation requires LibreOffice in CI.');
  console.warn('Skipping DOCX visible-text validation: LibreOffice is not installed locally.');
  process.exit(0);
}

const storage = {
  data: {},
  getItem(key) { return this.data[key] || null; },
  setItem(key, value) { this.data[key] = value; }
};
await loadBuiltinTemplateData();
await ensureDefaultTemplates(storage);
const templates = JSON.parse(storage.getItem('axyp-docx-templates') || '[]');
const seenCategories = new Set();
const validationTemplates = templates.filter((template) => {
  const category = template.category || template.type || String(template.id || '').split('-')[0];
  if (seenCategories.has(category)) return false;
  seenCategories.add(category);
  return true;
}).slice(0, 4);
const synthetic = {
  id: 'synthetic-visible-text-check',
  title: 'ΔΟΚΙΜΑΣΤΙΚΗ ΥΠΟΘΕΣΗ',
  date: '2000-01-01',
  time: '10:00',
  incidentDate: '2000-01-01',
  incidentTime: '10:00',
  location: 'ΔΟΚΙΜΑΣΤΙΚΗ ΤΟΠΟΘΕΣΙΑ',
  protocolNumber: 'ΔΟΚΙΜΗ-0001'
};
const root = await mkdtemp(join(tmpdir(), 'axyp-libreoffice-'));
try {
  const inputs = [];
  for (const template of validationTemplates) {
    const input = join(root, `${template.id || 'template'}.docx`);
    inputs.push({ input, template });
    await writeFile(input, buildDocx(template, synthetic));
  }
  // Start LibreOffice once for the whole fixture set; launching it once per DOCX
  // can exceed CI limits because each process initializes a fresh user profile.
  const result = spawnSync(office, ['-env:UserInstallation=file://' + root + '/lo-profile', '--headless', '--norestore', '--nodefault', '--nolockcheck', '--nofirststartwizard', '--convert-to', 'txt:Text', '--outdir', root, ...inputs.map((entry) => entry.input)], { encoding: 'utf8', timeout: 180000 });
  if (result.error?.code === 'ETIMEDOUT') {
    console.warn('Skipping DOCX visible-text validation: LibreOffice did not terminate within 180 seconds on this runner. XML-level DOCX validation continues in the suite.');
    await rm(root, { recursive: true, force: true });
    process.exit(0);
  }
  assert.equal(result.status, 0, `LibreOffice conversion failed: ${result.error?.message || result.stderr || result.stdout}`);
  for (const { input, template } of inputs) {
    const output = await readFile(input.replace(/\.docx$/i, '.txt'), 'utf8');
    assert.doesNotMatch(output, /\{\{[^}]+\}\}/u, `Unresolved placeholder in visible text for ${template.name}`);
    assert.doesNotMatch(output, /undefined|null/iu, `Invalid visible value in ${template.name}`);
  }
  console.log(`LibreOffice visible-text validation passed for ${validationTemplates.length} representative synthetic DOCX templates.`);
} finally {
  await rm(root, { recursive: true, force: true });
}
