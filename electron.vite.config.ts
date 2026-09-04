import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          // sandboxed preload scripts must be CommonJS
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    server: {
      // Keep a deterministic, HMR-free endpoint for the local Electron golden path.
      port: 5173,
      strictPort: Boolean(process.env['NOVEL_STUDIO_STABLE']),
      hmr: process.env['NOVEL_STUDIO_STABLE'] ? false : undefined
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
