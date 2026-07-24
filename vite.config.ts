import { defineConfig, createLogger } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vite's built-in WS proxy (server/middlewares/proxy.ts) attaches its own
// unconditional error logger on top of whatever `server.proxy['/py-api'].configure()`
// registers — so ECONNRESET from a client hard-disconnect (dev refresh, backend
// --reload restart) still logs "ws proxy error:" / "ws proxy socket error:" even
// with a custom `error`/`proxyReqWs` handler. Filtering at the logger is the only
// layer that actually suppresses it.
const logger = createLogger()
const loggerError = logger.error.bind(logger)
logger.error = (msg, options) => {
  if (msg.includes('ECONNRESET')) return
  loggerError(msg, options)
}

// https://vite.dev/config/
export default defineConfig({
  customLogger: logger,
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/py-api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/py-api/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            if (err.message.includes('ECONNRESET')) return;
            console.log('proxy error', err);
          });
          proxy.on('proxyReqWs', (proxyReq, req, socket, options, head) => {
            socket.on('error', (err) => {
              if (err.message.includes('ECONNRESET')) return;
              console.error('ws proxy socket error:', err);
            });
          });
        }
      },
      '/yahoo-api': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yahoo-api/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://finance.yahoo.com/',
        },
      },
    },
    watch: {
      ignored: ['**/python_engine/**', '**/.venv/**', '**/.venv_*/**', '**/venv_backup/**', '**/venv/**']
    }
  },
})
