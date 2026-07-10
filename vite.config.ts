import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  plugins: [
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
    }),
    vue({
      template: {
        compilerOptions: {
          whitespace: 'condense',
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['element-plus', '@element-plus/icons-vue'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/element-plus/')) return 'element-plus'
          if (id.includes('node_modules/@element-plus/icons-vue')) return 'element-plus-icons'
          if (id.includes('node_modules/echarts/')) return 'echarts'
          if (
            id.includes('node_modules/markdown-it') ||
            id.includes('node_modules/katex') ||
            id.includes('node_modules/highlight.js')
          )
            return 'vendor-utils'
        },
      },
      onwarn(warning, warn) {
        // 抑制 element-plus → @vueuse/core 传递依赖的 INVALID_ANNOTATION 警告
        if (warning.code === 'INVALID_ANNOTATION') return
        warn(warning)
      },
    },
    chunkSizeWarningLimit: 500,
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://192.168.31.13:8001',
        changeOrigin: true,
        // rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/instance': {
        target: 'http://192.168.31.13:8001',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/instance/, ''),
      },
      '/task': {
        target: 'http://192.168.31.13:8001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/task/, '/api'),
      },
      "/opencode":{
        target: 'http://192.168.31.13:8001',
        changeOrigin: true,
        // rewrite: (path) => path.replace(/^\/opencode/, ''),
      }
    },
  },
})
