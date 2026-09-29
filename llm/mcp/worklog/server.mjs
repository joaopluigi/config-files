import { fileURLToPath } from 'node:url';
import { createServer } from './src/mcp/tools.mjs';
import { startStdio } from './src/runtime/stdio.mjs';
export * from './src/storage/repository.mjs';
export { withLock } from './src/storage/locks.mjs';
export { completion, validateAppend } from './src/domain/worklog.mjs';

const server = createServer();
if (process.argv[1] === fileURLToPath(import.meta.url)) startStdio(server);
