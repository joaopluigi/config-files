import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const mcpProxyTarget = globalThis.process?.env.WORKLOG_MCP_PROXY_TARGET;

export default defineConfig({
  build: {
    outDir: 'dist',
  },
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: mcpProxyTarget
      ? {
          '/mcp': {
            target: mcpProxyTarget,
            changeOrigin: true,
            rewrite: (path) => path,
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.setHeader('origin', mcpProxyTarget);
              });
            },
          },
        }
      : undefined,
  },
});
