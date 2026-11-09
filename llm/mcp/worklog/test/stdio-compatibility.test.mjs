import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverEntrypoint = fileURLToPath(new URL('../server.mjs', import.meta.url));

function nextJsonLine(child) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      child.stdout.off('data', onData);
      resolve(JSON.parse(buffer.slice(0, newline)));
    };
    child.stdout.on('data', onData);
    child.once('error', reject);
  });
}

test('server.mjs keeps the stdio MCP initialization and read-only round trip contract', async () => {
  const worklogDir = await mkdtemp(join(tmpdir(), 'stdio-mcp-'));
  const child = spawn(process.execPath, [serverEntrypoint], {
    env: { ...process.env, WORKLOG_DIR: worklogDir },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  try {
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'stdio-test', version: '1.0.0' },
        },
      })}\n`,
    );
    const initialize = await nextJsonLine(child);
    assert.equal(initialize.id, 1);
    assert.equal(initialize.result.serverInfo.name, 'delegation-worklog');

    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'worklog_session_status', arguments: { actor: 'orchestrator' } },
      })}\n`,
    );
    const listed = await nextJsonLine(child);
    assert.equal(listed.id, 2);
    assert.equal(listed.result.content[0].type, 'text');
    assert.deepEqual(JSON.parse(listed.result.content[0].text), { sessions: [] });
    assert.match(stderr, /delegation-worklog MCP server running on stdio/);
  } finally {
    child.kill('SIGTERM');
    await rm(worklogDir, { recursive: true, force: true });
  }
});
