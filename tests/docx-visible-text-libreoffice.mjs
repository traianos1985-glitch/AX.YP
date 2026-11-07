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
  for (const template of templates) {
    const input = join(root, `${template.id || 'template'}.docx`);
    await writeFile(input, buildDocx(template, synthetic));
    const result = spawnSync(office, ['--headless', '--convert-to', 'txt:Text', '--outdir', root, input], { encoding: 'utf8' });
    assert.equal(result.status, 0, `LibreOffice conversion failed for ${template.name}: ${result.stderr || result.stdout}`);
    const output = await readFile(input.replace(/\.docx$/i, '.txt'), 'utf8');
    assert.doesNotMatch(output, /\{\{[^}]+\}\}/u, `Unresolved placeholder in visible text for ${template.name}`);
    assert.doesNotMatch(output, /undefined|null/iu, `Invalid visible value in ${template.name}`);
  }
  console.log(`LibreOffice visible-text validation passed for ${templates.length} synthetic DOCX templates.`);
} finally {
  await rm(root, { recursive: true, force: true });
}
