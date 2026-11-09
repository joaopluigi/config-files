import { randomBytes } from 'node:crypto';
import { fstatSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const serverEntrypoint = join(packageRoot, 'server.mjs');
const httpEntrypoint = join(packageRoot, 'src', 'runtime', 'http.mjs');
const appRoot = join(packageRoot, 'app');
const viteEntrypoint = join(appRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const host = '127.0.0.1';

const children = new Set();
let shuttingDown = false;
let shutdownPromise;

function log(message) {
  process.stderr.write(`[worklog-supervisor] ${message}\n`);
}

function spawnChild(label, entrypoint, args, env, stdio, cwd = packageRoot) {
  const child = spawn(process.execPath, [entrypoint, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio,
  });
  child.label = label;
  children.add(child);
  child.stderr?.on('data', (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`);
  });
  child.once('error', (error) => {
    log(`${label} failed: ${error.stack || error}`);
    if (!shuttingDown) void shutdown(1);
  });
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      log(`${label} exited unexpectedly: code=${code} signal=${signal}`);
      void shutdown(1);
    }
  });
  return child;
}

function waitForOutput(child, pattern) {
  return new Promise((resolve, reject) => {
    let output = '';
    const onData = (chunk) => {
      output += chunk;
      const match = output.match(pattern);
      if (!match) return;
      cleanup();
      resolve({ match, output });
    };
    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`${child.label} exited before readiness: code=${code} signal=${signal}`));
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      child.stdout?.off('data', onData);
      child.stderr?.off('data', onData);
      child.off('exit', onExit);
      child.off('error', onError);
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once('exit', resolve));
}

async function shutdown(exitCode = 0) {
  if (shutdownPromise) return shutdownPromise;
  shuttingDown = true;
  shutdownPromise = (async () => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    }
    await Promise.all([...children].map(waitForExit));
    process.exitCode = exitCode;
  })();
  return shutdownPromise;
}

async function start() {
  const sharedEnv = {
    WORKLOG_DIR: process.env.WORKLOG_DIR || '/tmp/worklogs',
    WORKLOG_MCP_TOKEN: process.env.WORKLOG_MCP_TOKEN || randomBytes(32).toString('hex'),
    WORKLOG_HTTP_HOST: host,
    WORKLOG_HTTP_PORT: process.env.WORKLOG_HTTP_PORT || '0',
  };

  const stdio = spawnChild('stdio', serverEntrypoint, [], sharedEnv, ['pipe', 'pipe', 'pipe']);
  stdio.stdout.on('data', (chunk) => process.stdout.write(chunk));
  stdio.stdin.on('error', () => {});
  const stdinStats = fstatSync(0);
  if (stdinStats.isFIFO() || stdinStats.isSocket()) {
    process.stdin.on('data', (chunk) => stdio.stdin.write(chunk));
    process.stdin.on('end', () => {
      stdio.stdin.end();
      void shutdown(0);
    });
  }

  const http = spawnChild('http', httpEntrypoint, [], sharedEnv, ['ignore', 'ignore', 'pipe']);
  const httpReady = await waitForOutput(
    http,
    /WORKLOG_MCP_ENDPOINT=(http:\/\/127\.0\.0\.1:\d+\/mcp) WORKLOG_MCP_TOKEN=([^\s\n]+)/,
  );
  const httpEndpoint = httpReady.match[1];
  const token = httpReady.match[2];

  const vite = spawnChild(
    'vite',
    viteEntrypoint,
    ['--host', host, '--port', process.env.WORKLOG_VITE_PORT || '0', '--strictPort'],
    {
      ...sharedEnv,
      WORKLOG_MCP_PROXY_TARGET: new URL(httpEndpoint).origin,
      VITE_MCP_ENDPOINT: '/mcp',
      VITE_MCP_TOKEN: token,
    },
    ['ignore', 'pipe', 'pipe'],
    appRoot,
  );
  vite.stdout.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`));
  const viteReady = await waitForOutput(vite, /Local:\s+(http:\/\/127\.0\.0\.1:\d+\/?)/);
  const viteEndpoint = viteReady.match[1].replace(/\/$/, '');
  log(
    `WORKLOG_MCP_ENDPOINT=${httpEndpoint} WORKLOG_MCP_TOKEN=${token} WORKLOG_VITE_ENDPOINT=${viteEndpoint}`,
  );
}

process.once('SIGINT', () => void shutdown(0));
process.once('SIGTERM', () => void shutdown(0));

start().catch(async (error) => {
  log(error.stack || error);
  await shutdown(1);
});
