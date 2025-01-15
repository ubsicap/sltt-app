import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts') /* Existing main process entry */,
          storage: resolve(__dirname, 'storage/index.ts') /*  New entry point */,
          storageServer: resolve(__dirname, 'storage/server.ts'),
        },
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
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
