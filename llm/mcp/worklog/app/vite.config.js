import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const mcpProxyTarget = globalThis.process?.env.WORKLOG_MCP_PROXY_TARGET;
const vitePort = Number(globalThis.process?.env.WORKLOG_VITE_PORT || 5173);

export default defineConfig({
  build: {
    outDir: 'dist',
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: vitePort,
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
