import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { cdpAgentMiddleware } from './src/server/agent-service.js';

function cdpAgentPlugin(): Plugin {
  return {
    name: 'cdp-agent-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        cdpAgentMiddleware(req, res, next);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), cdpAgentPlugin()],
  resolve: {
    alias: {
      '@moni/cdp-driver': path.resolve(__dirname, '../../packages/cdp-driver/src/index.ts'),
      '@moni/nl-browser': path.resolve(__dirname, '../../packages/nl-browser/src/index.ts'),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
