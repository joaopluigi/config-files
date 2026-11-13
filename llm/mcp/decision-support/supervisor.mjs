import { fileURLToPath } from 'node:url';
import { startStdio } from './src/runtime/stdio.mjs';
import { createServer } from './src/mcp/server.mjs';

const server = createServer();
if (process.argv[1] === fileURLToPath(import.meta.url)) startStdio(server);
