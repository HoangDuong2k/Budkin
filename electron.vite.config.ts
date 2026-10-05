import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // node:sqlite có sẵn trong Node của Electron. Khai báo rõ vì electron-vite chỉ tự để ngoài các module
        // có trong builtinModules của Node đang chạy build (Node 20 không có sqlite → bị bundle hỏng mà không báo)
        external: ['node:sqlite'],
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          // Cầu nối MCP: app AI chạy bằng chính file Budkin ở chế độ Node (xem src/main/mcp-bridge.ts)
          'mcp-bridge': resolve(__dirname, 'src/main/mcp-bridge.ts')
        }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    },
    // Một bản React duy nhất cho cả app và momi-ui
    resolve: { dedupe: ['react', 'react-dom'] },
    plugins: [react(), tailwindcss()]
  }
})
