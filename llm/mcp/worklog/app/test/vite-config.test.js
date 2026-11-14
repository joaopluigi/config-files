/* global process, describe, it, expect */

const mcpProxyTarget = 'http://127.0.0.1:3030';

process.env.WORKLOG_MCP_PROXY_TARGET = mcpProxyTarget;

const { default: viteConfig } = await import('../vite.config.js');

describe('Vite development server configuration', () => {
  it('uses the fixed port and refuses to fall back to another port', () => {
    expect(viteConfig.server).toMatchObject({
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    });
  });

  it('keeps the MCP proxy configuration present', () => {
    expect(viteConfig.server.proxy['/mcp']).toMatchObject({
      target: mcpProxyTarget,
      changeOrigin: true,
    });
  });
});
