import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      lib: { entry: resolve(__dirname, 'electron/main.ts') }
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build: {
      lib: { entry: resolve(__dirname, 'electron/preload.ts') }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        // Two independent HTML entries sharing one renderer build/resolve
        // config: index.html (the main app) and overlay.html (M15's
        // crosshair overlay window — see src/overlay/main.ts). Kept as a
        // separate entry rather than a mode of the main app so its bundle
        // never pulls in React Router-equivalent state, fonts, or app CSS.
        input: {
          index: resolve(__dirname, 'index.html'),
          overlay: resolve(__dirname, 'overlay.html')
        }
      }
    },
    resolve: {
      alias: { '@': resolve(__dirname, 'src') }
    },
    plugins: [react()]
  }
})
