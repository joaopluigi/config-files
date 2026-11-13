import { createInterface } from 'node:readline';

export function startStdio(server) {
  process.stderr.write('decision-support MCP server running on stdio\n');
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    input.close();
    server.close?.();
  };
  input.on('line', async (line) => {
    if (!line.trim() || closed) return;
    let request;
    try {
      request = JSON.parse(line);
      const response = await server.handle(request);
      if (response !== undefined && !closed) process.stdout.write(`${JSON.stringify(response)}\n`);
    } catch (error) {
      if (!closed) process.stdout.write(`${JSON.stringify({
        jsonrpc: '2.0',
        id: request?.id ?? null,
        error: { code: -32700, message: error instanceof Error ? error.message : String(error) },
      })}\n`);
    }
  });
  input.on('close', close);
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}
