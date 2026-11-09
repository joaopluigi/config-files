import { serveStdio } from '@modelcontextprotocol/server/stdio';
export function startStdio(server) {
  console.error('delegation-worklog MCP server running on stdio');
  void serveStdio(() => server);
}
