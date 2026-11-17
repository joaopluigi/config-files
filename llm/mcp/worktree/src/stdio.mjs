import { serveStdio } from "@modelcontextprotocol/server/stdio";

export function startStdio(server) {
  console.error("worktree-lifecycle MCP server running on stdio");
  void serveStdio(() => server);
}
