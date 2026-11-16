// CI matrix helper: switch the React major used by the library's tests.
// Usage: node scripts/use-react.mjs 18|19
//
// react-xlsx-viewer supports React 18 and 19. Rewrites the react / react-dom /
// @types / Testing Library devDependency ranges of packages/react-xlsx-viewer
// (and the playground's), then resolves a fresh tree without the lockfile, so
// npm gives one consistent set. This edits the working tree and replaces
// node_modules: meant for CI jobs (run it instead of `npm ci`); locally,
// `git checkout -- package-lock.json '*/*/package.json' && npm ci` restores
// the default. Same approach as react-data-export's scripts/use-react.mjs.
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const sets = {
  18: { react: '^18.3.1', 'react-dom': '^18.3.1', '@types/react': '^18.3.0', '@types/react-dom': '^18.3.0', '@testing-library/react': '^16.3.0' },
  19: null, // the committed default
};

const major = process.argv[2];
if (!(major in sets)) {
  console.error(`usage: use-react.mjs <${Object.keys(sets).join('|')}>`);
  process.exit(1);
}
if (sets[major] === null) {
  console.log(`React ${major} is the committed default; nothing to change.`);
  process.exit(0);
}

const root = resolve(import.meta.dirname, '..');
const sh = (args) => execFileSync('npm', args, { cwd: root, stdio: 'inherit' });
sh(['pkg', 'set', '-w', 'react-xlsx-viewer', ...Object.entries(sets[major]).map(([k, v]) => `devDependencies.${k}=${v}`)]);
// Align the playground too, so the tree holds one React.
const pinned = Object.entries(sets[major]).filter(([k]) => !k.startsWith('@testing-library/'));
sh(['pkg', 'set', '-w', 'playground', ...pinned.map(([k, v]) => `${k.startsWith('@types/') ? 'devDependencies' : 'dependencies'}.${k}=${v}`)]);
for (const dir of ['package-lock.json', 'node_modules', 'packages/react-xlsx-viewer/node_modules', 'apps/playground/node_modules']) {
  rmSync(join(root, dir), { recursive: true, force: true });
}
sh(['install', '--no-audit', '--no-fund']);
