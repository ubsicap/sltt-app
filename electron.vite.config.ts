import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import commonjs from '@rollup/plugin-commonjs';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), commonjs()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts') /* Existing main process entry */,
        },
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin(), commonjs()]
  },
  renderer: {
    logLevel: 'info',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/renderer/index.html'),
          newPrivateWindow: resolve(__dirname, 'src/renderer/dialogs/newPrivateWindow.html')
        }
      }
    }
  }
})
