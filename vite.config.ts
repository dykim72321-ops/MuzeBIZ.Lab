import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/py-api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/py-api/, ''),
      },
      '/yahoo-api': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yahoo-api/, ''),
      },
    },
  },
})
