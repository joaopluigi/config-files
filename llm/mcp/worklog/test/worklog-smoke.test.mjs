import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const server = fileURLToPath(new URL('../server.mjs', import.meta.url));
test('server starts without writing protocol data to stderr/stdout until input', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'worklog-mcp-'));
  const child = spawn(process.execPath, [server], { env: { ...process.env, WORKLOG_DIR: dir } });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  await new Promise((resolve) => setTimeout(resolve, 150));
  child.kill('SIGTERM');
  assert.match(stderr, /running on stdio/);
  assert.equal(
    (await readFile(join(dir, '..', 'missing'), { encoding: 'utf8' }).catch(() => '')).length,
    0,
  );
});
