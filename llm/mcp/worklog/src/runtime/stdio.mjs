import { serveStdio } from '@modelcontextprotocol/server/stdio';
export function startStdio(server) {
  void serveStdio(() => server);
  console.error('delegation-worklog MCP server running on stdio');
}
