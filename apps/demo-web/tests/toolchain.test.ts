import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const applicationRoot = fileURLToPath(new URL('..', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

test('demo resolves the supported Angular 16 build and browser toolchain', () => {
  const manifest = readJson(`${applicationRoot}/package.json`);
  const rootManifest = readJson(`${repositoryRoot}/package.json`);
  const angular = readJson(`${applicationRoot}/angular.json`);
  const tsconfig = readJson(`${applicationRoot}/tsconfig.json`);

  assert.equal(manifest.dependencies['@angular/core'], '^16.2.0');
  assert.equal(manifest.devDependencies['@angular/cli'], '^16.2.0');
  assert.equal(manifest.devDependencies.typescript, '~5.1.6');
  assert.equal(manifest.devDependencies['@angular/build'], undefined);
  assert.equal(rootManifest.engines.node, '^18.17.0');
  assert.deepEqual(
    angular.projects['demo-web'].architect.build.options.polyfills,
    ['zone.js'],
  );
  assert.equal(tsconfig.compilerOptions.target, 'ES2020');
});
