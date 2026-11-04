import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const files = [
  'data.js',
  'forms.js',
  'docx-export.js',
  'forms-view.js',
  'docs-view.js',
  'app.js',
  'case-bundles.js',
  'case-enhancements.js',
  'hypotheses.js',
  'security.js',
  'storage.js',
  'template-library.js',
  'templates.js',
  'sw.js',
  'manifest.json',
  'icon-192.svg',
  'icon-512.svg',
  'icon-maskable.svg',
  'CHANGELOG.md',
  'PENDING.md'
];

function copyStaticFiles() {
  return {
    name: 'copy-static-files',
    closeBundle() {
      const outDir = path.resolve('dist');
      for (const file of files) {
        if (fs.existsSync(file)) {
          fs.copyFileSync(file, path.join(outDir, file));
        }
      }
      if (fs.existsSync('sources')) {
        fs.cpSync('sources', path.join(outDir, 'sources'), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  base: './',
  server: {
    allowedHosts: ['sb-40r56ujyldw6.vercel.run'],
  },
  plugins: [copyStaticFiles()],
});
