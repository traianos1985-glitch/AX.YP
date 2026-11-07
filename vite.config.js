import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';

const files = [
  'data.js', 'forms.js', 'docx-export.js', 'forms-view.js', 'docs-view.js', 'app.js',
  'case-bundles.js', 'case-enhancements.js', 'case-workflow.js', 'hypotheses.js',
  'security.js', 'storage.js', 'service-profile.js', 'case-folder-storage.js', 'incident-search.js',
  'dossier-categories.js', 'template-library.js', 'template-data/narcotics.js', 'template-data/counterfeit.js', 'template-data/environment.js', 'template-data/health.js',
  'noise-templates-data.js', 'camping-templates-data.js', 'paremporio-templates.js',
  'templates.js', 'sw.js', 'manifest.json', 'vendor/fflate.js',
  'icon-192.png', 'icon-512.png', 'icon-192.svg', 'icon-512.svg', 'icon-maskable.svg',
  'CHANGELOG.md', 'PENDING.md', 'ΟΔΗΓΙΕΣ-ΧΡΗΣΗΣ.md'
];

function copyStaticFiles() {
  return {
    name: 'copy-static-files-and-version-service-worker',
    closeBundle() {
      const outDir = path.resolve('dist');
      for (const file of files) {
        if (!fs.existsSync(file)) continue;
        const dest = path.join(outDir, file);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(file, dest);
      }
      for (const directory of ['templates', 'sources', 'dossier-packages']) {
        if (fs.existsSync(directory)) fs.cpSync(directory, path.join(outDir, directory), { recursive: true });
      }

      // Deterministic hash of shipped static assets; sw.js is excluded to avoid self-reference.
      const hash = createHash('sha256');
      const addFile = (absolutePath, relativePath) => {
        hash.update(relativePath.split(path.sep).join('/') + '\0');
        hash.update(fs.readFileSync(absolutePath));
        hash.update('\0');
      };
      // Hash the copied service worker while it still contains axyp-dev; this makes SW logic changes invalidate the cache without a circular digest.
      const candidates = files.concat(['index.html', 'dossier-packages/manifest.json']);
      for (const file of candidates) {
        const absolutePath = path.join(outDir, file);
        if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) addFile(absolutePath, file);
      }
      for (const directory of ['templates', 'sources', 'dossier-packages']) {
        const root = path.join(outDir, directory);
        if (!fs.existsSync(root)) continue;
        const walk = (current) => {
          const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
          for (const entry of entries) {
            const absolutePath = path.join(current, entry.name);
            if (entry.isDirectory()) walk(absolutePath);
            else if (entry.isFile()) addFile(absolutePath, path.relative(outDir, absolutePath));
          }
        };
        walk(root);
      }
      const version = hash.digest('hex').slice(0, 16);
      const serviceWorkerPath = path.join(outDir, 'sw.js');
      const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
      if (!serviceWorker.includes('axyp-dev')) throw new Error('Service-worker cache version placeholder axyp-dev was not found.');
      fs.writeFileSync(serviceWorkerPath, serviceWorker.replace('axyp-dev', 'axyp-' + version));
    }
  };
}

export default defineConfig({ base: './', plugins: [copyStaticFiles()] });
