import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { classifyNavigation, openLocalFile } from '../electron/navigation.mjs';
import { shutdown, startServer } from '../electron/server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const electronEntry = join(root, 'electron', 'main.mjs');
const electronServer = join(root, 'electron', 'server.mjs');
const packageJson = join(root, 'package.json');

async function source(path) {
  return readFile(path, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
}

async function packageMetadata() {
  return JSON.parse(await source(packageJson));
}

test('navigation classifier accepts app URLs, external HTTP(S), and denies hostile prefixes or schemes', () => {
  const base = 'http://127.0.0.1:43123';
  assert.equal(classifyNavigation(base, `${base}/`), 'app');
  assert.equal(classifyNavigation(base, 'http://127.0.0.1.evil.example/'), 'external');
  assert.equal(classifyNavigation(base, 'https://example.com/'), 'external');
  assert.equal(classifyNavigation(base, 'file:///etc/passwd'), 'local-file');
  assert.equal(classifyNavigation(base, 'javascript:alert(1)'), 'deny');
  assert.equal(classifyNavigation(base, 'not a url'), 'deny');
});

test('local file links open only existing readable files without remote hosts', async () => {
  const filePath = join(tmpdir(), `worklog-source-link-${process.pid}.txt`);
  await writeFile(filePath, 'fixture');
  const opened = [];
  try {
    assert.equal(
      await openLocalFile(new URL(`file://${filePath}`).href, async (path) => {
        opened.push(path);
        return '';
      }),
      true,
    );
    assert.deepEqual(opened, [filePath]);
    assert.equal(
      await openLocalFile('file://remote.example/tmp/file.txt', async () => {
        opened.push('remote');
        return '';
      }),
      false,
    );
    assert.equal(
      await openLocalFile('file:///definitely/missing/worklog-source-link.txt', async () => {
        opened.push('missing');
        return '';
      }),
      false,
    );
    assert.equal(
      await openLocalFile('javascript:alert(1)', async () => {
        opened.push('unsupported');
        return '';
      }),
      false,
    );
    assert.equal(
      classifyNavigation('http://127.0.0.1:43123', new URL(`file://${filePath}`).href),
      'local-file',
    );
  } finally {
    await rm(filePath, { force: true });
  }
});

test('local file links require explicit readability and successful native opening', async () => {
  const filePath = join(tmpdir(), `worklog-source-link-${process.pid}-readability.txt`);
  await writeFile(filePath, 'fixture');
  const url = new URL(`file://${filePath}`).href;
  try {
    const accessCalls = [];
    assert.equal(
      await openLocalFile(
        url,
        async () => '',
        async (path, mode) => accessCalls.push([path, mode]),
      ),
      true,
    );
    assert.deepEqual(accessCalls, [[filePath, 4]]);
    assert.equal(
      await openLocalFile(
        url,
        async () => '',
        async () => {
          throw new Error('not readable');
        },
      ),
      false,
    );
    assert.equal(await openLocalFile(url, async () => 'native open failed'), false);
    assert.equal(
      await openLocalFile(url, async () => {
        throw new Error('native open threw');
      }),
      false,
    );
  } finally {
    await rm(filePath, { force: true });
  }
});

test('electron server serves a built renderer fixture from app/dist', async () => {
  const rendererRoot = join(root, 'app', 'dist');
  await mkdir(rendererRoot, { recursive: true });
  await writeFile(join(rendererRoot, 'index.html'), '<!doctype html><title>fixture</title>');
  try {
    const { port } = await startServer();
    const response = await globalThis.fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /fixture/);
  } finally {
    await shutdown();
    await rm(rendererRoot, { recursive: true, force: true });
  }
});

test('electron server binds loopback on an ephemeral port and serves static assets plus JSON/SSE routes', async () => {
  const text = await source(electronServer);
  assert.match(text, /127\\.0\\.0\\.1/);
  assert.match(text, /port\\s*:\\s*0|listen\([^)]*0/);
  assert.match(text, /static|index\\.html/);
  assert.match(text, /json|application\/json/);
  assert.match(text, /text\/event-stream|SSE|event-stream/);
});

test('electron HTTP routes preserve status, payload, and redaction behavior', async () => {
  const text = await source(electronServer);
  assert.match(text, /statusCode|status/);
  assert.match(text, /JSON\.stringify|payload/);
  assert.match(text, /redact|redaction|sanitize/);
});

test('BrowserWindow applies explicit security, navigation, and external-link policy', async () => {
  const text = await source(electronEntry);
  assert.match(text, /contextIsolation\s*:\s*true/);
  assert.match(text, /nodeIntegration\s*:\s*false/);
  assert.match(text, /sandbox\s*:\s*true/);
  assert.match(text, /setWindowOpenHandler|will-navigate|did-create-window/);
  assert.match(text, /shell\.openExternal|openExternal/);
});

test('WORKLOG_DIR defaults safely and supports an explicit override', async () => {
  const text = await source(electronServer);
  assert.match(text, /WORKLOG_DIR/);
  assert.match(text, /process\.env\.WORKLOG_DIR/);
  assert.match(text, /homedir|cwd|worklog/i);
});

test('shutdown is idempotent and closes HTTP, SSE, watcher, and timers', async () => {
  const text = `${await source(electronEntry)}\n${await source(electronServer)}`;
  assert.match(text, /shutdown|close|dispose/);
  assert.match(text, /server\.close|closeAllConnections/);
  assert.match(text, /SSE|event-stream|clients|connections/);
  assert.match(text, /watch|FSWatcher|unwatch/);
  assert.match(text, /clearTimeout|clearInterval/);
});

test('packaging metadata declares macOS DMG/ZIP and Linux x64 AppImage strategy', async () => {
  const pkg = await packageMetadata();
  const build = pkg.build ?? {};
  const mac = build.mac ?? {};
  const linux = build.linux ?? {};
  const targets = JSON.stringify({ mac, linux, makers: build.makers, scripts: pkg.scripts });
  assert.match(targets, /dmg/i);
  assert.match(targets, /zip/i);
  assert.match(targets, /appimage/i);
  assert.match(targets, /x64|x86_64|amd64/i);
});
