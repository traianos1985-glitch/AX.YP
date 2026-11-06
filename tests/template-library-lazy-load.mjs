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
  'The templates panel must wait for built-in templates to finish seeding'
);
assert.match(
  library,
  /const ready = initializeDefaultTemplates\(\)/,
  'The module must expose a promise for completed initialization'
);
assert.match(
  library,
  /ready \}/,
  'The initialization promise must be exposed to the app'
);
for (const category of ['narcotics', 'counterfeit', 'environment', 'health']) {
  assert.ok(serviceWorker.includes(`./template-data/${category}.js`), `The service worker must precache offline ${category} template data`);
}
for (const category of ['narcotics', 'counterfeit', 'environment', 'health']) {
  assert.ok(library.includes(`import('./template-data/${category}.js')`), `The library must dynamically load the ${category} chunk`);
}
assert.doesNotMatch(library, /from ['"]\.\/dossier-templates-data\.js['"]/);

console.log('Template-library lazy-load checks passed.');
