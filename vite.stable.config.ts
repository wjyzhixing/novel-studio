import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve('src/renderer'),
  plugins: [react()],
  resolve: { alias: { '@': resolve('src/renderer/src') } },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, hmr: false }
})
