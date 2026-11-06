import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, app, library, serviceWorker] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../app.js', import.meta.url), 'utf8'),
  readFile(new URL('../template-library.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8')
]);

assert.doesNotMatch(
  html,
  /<script\s+type=["']module["']\s+src=["']template-library\.js["']/,
  'The large DOCX template library must not be loaded as an initial page script'
);
assert.match(
  app,
  /await import\(['"]\.\/template-library\.js['"]\)/,
  'The template library must be imported when the templates panel is opened'
);
assert.match(
  app,
  /await window\.TemplateLibrary\.ready/,
  'The templates panel must wait for local storage hydration'
);
assert.match(library, /const ready = initializeDefaultTemplates\(\)/);
assert.match(library, /ready \}/);

const categories = ['narcotics', 'counterfeit', 'environment', 'health', 'noise', 'camping', 'commerce'];
for (const category of categories) {
  assert.match(
    library,
    new RegExp(category + ": \\(\\) => import\\("),
    `The ${category} data must have an independent dynamic-import loader`
  );
  assert.ok(
    serviceWorker.includes(category === 'narcotics' || category === 'counterfeit' || category === 'environment' || category === 'health'
      ? `./template-data/${category}.js`
      : category === 'noise' ? './noise-templates-data.js'
      : category === 'camping' ? './camping-templates-data.js'
      : './paremporio-templates.js'),
    `The service worker must precache offline ${category} template data`
  );
}

assert.match(
  library,
  /await ensureDefaultTemplates\(storage\(\), group\.category\)/,
  'Only the category opened by the user may be seeded and loaded by the UI'
);
assert.match(library, /const expandedCategories = new Set\(\)/);
assert.match(library, /document\.createElement\('details'\)/);
assert.match(
  library,
  /export async function initializeDefaultTemplates[\s\S]*?return true;/,
  'Initial module setup must wait for storage hydration without seeding every category'
);
const initializer = library.slice(
  library.indexOf('export async function initializeDefaultTemplates'),
  library.indexOf('function uint8ToBase64')
);
assert.doesNotMatch(initializer, /ensureDefaultTemplates|loadBuiltinTemplateData/);
assert.doesNotMatch(library, /from ['"]\.\/dossier-templates-data\.js['"]/);

console.log('Template-library per-category lazy-load and offline checks passed.');
