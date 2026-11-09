import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const cleanupTest = relative(root, fileURLToPath(import.meta.url));

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((file) => file !== cleanupTest);
}

function source(file) {
  return readFileSync(join(root, file), 'utf8');
}

function packageJson(file) {
  return JSON.parse(source(file));
}

function packageKeys(packageFile) {
  const pkg = packageJson(packageFile);
  return [
    ...Object.keys(pkg.scripts ?? {}),
    ...Object.values(pkg.scripts ?? {}),
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    pkg.main ?? '',
  ];
}

test('cleanup removes Electron runtime, packaging, and active package/lockfile entries', () => {
  const files = trackedFiles();
  const electronFiles = files.filter(
    (file) =>
      file === 'llm/mcp/worklog/electron' ||
      file.startsWith('llm/mcp/worklog/electron/') ||
      file === 'llm/mcp/worklog/app/electron-builder.yml',
  );
  const packageRefs = [
    ...packageKeys('llm/mcp/worklog/package.json'),
    ...packageKeys('llm/mcp/worklog/app/package.json'),
  ].filter((value) => /electron/i.test(value));
  const lockRefs = [
    'llm/mcp/worklog/package-lock.json',
    'llm/mcp/worklog/app/package-lock.json',
  ].flatMap((lockfile) => {
    const lock = JSON.parse(source(lockfile));
    return Object.keys(lock.packages ?? {})
      .filter((value) => /electron/i.test(value))
      .map((value) => `${lockfile}:${value}`);
  });
  assert.deepEqual(
    { electronFiles, packageRefs, lockRefs },
    { electronFiles: [], packageRefs: [], lockRefs: [] },
    'Electron runtime, packaging, active package references, and lockfile entries must be absent',
  );
});

test('cleanup removes obsolete REST/SSE compatibility files and active references', () => {
  const obsoleteFiles = [
    'llm/mcp/worklog/app/src/mcp/api.js',
    'llm/mcp/worklog/app/src/mcp/legacyClient.js',
    'llm/mcp/worklog/app/src/mcp/readModel.js',
    'llm/mcp/worklog/app/src/mcp/watcher.js',
  ].filter((file) => existsSync(join(root, file)));
  const forbidden =
    /\/api\/worklogs|EventSource|startLegacyRefresh|(?:^|[./])(?:watcher|readModel)\.js\b/;
  const references = trackedFiles().filter((file) => forbidden.test(source(file)));
  assert.deepEqual(
    { obsoleteFiles, references },
    { obsoleteFiles: [], references: [] },
    'obsolete REST/SSE compatibility files and active references must be absent',
  );
});

test('browser, HTTP MCP, stdio MCP, storage, and service entrypoints remain configured', () => {
  const present = [
    'llm/mcp/worklog/app/index.html',
    'llm/mcp/worklog/app/vite.config.js',
    'llm/mcp/worklog/app/src/main.jsx',
    'llm/mcp/worklog/src/runtime/http.mjs',
    'llm/mcp/worklog/src/runtime/stdio.mjs',
    'llm/mcp/worklog/src/storage/store.mjs',
    'llm/mcp/worklog/src/service/worklog.mjs',
    'llm/mcp/worklog/server.mjs',
  ];
  for (const file of present)
    assert.equal(existsSync(join(root, file)), true, `${file} must remain present`);

  const browserPackage = packageJson('llm/mcp/worklog/app/package.json');
  assert.equal(browserPackage.scripts.build, 'vite build');
  assert.equal(browserPackage.scripts.test, 'vitest run');
  assert.match(source('llm/mcp/worklog/server.mjs'), /startStdio\(server\)/);
  assert.match(source('llm/mcp/worklog/src/runtime/http.mjs'), /export async function startHttp/);
  assert.match(source('llm/mcp/worklog/src/storage/store.mjs'), /export/);
  assert.match(source('llm/mcp/worklog/src/service/worklog.mjs'), /export/);
});
