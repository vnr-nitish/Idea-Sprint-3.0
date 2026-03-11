import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const nextDir = path.join(projectRoot, '.next');
const manifestPath = path.join(nextDir, 'prerender-manifest.json');

// Next start expects this file to exist. In some setups (notably app-router-only builds)
// Next may not emit it, causing `next start` to crash with ENOENT.
// We create a minimal manifest if it's missing.

if (!fs.existsSync(nextDir)) {
  console.error('Missing .next directory. Run `next build` first.');
  process.exit(1);
}

if (fs.existsSync(manifestPath)) {
  process.exit(0);
}

const minimal = {
  version: 4,
  routes: {},
  dynamicRoutes: {},
  notFoundRoutes: [],
  preview: {
    previewModeId: 'dev',
    previewModeSigningKey: 'dev',
    previewModeEncryptionKey: 'dev',
  },
};

fs.writeFileSync(manifestPath, JSON.stringify(minimal, null, 2), 'utf8');
console.log('Created missing .next/prerender-manifest.json');
