import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const ragProxyTarget = env.VITE_RAG_PROXY_TARGET || 'http://127.0.0.1:8000'

  return {
    base: command === 'build' ? '/phms' : '/phm',
    cacheDir: `node_modules/.vite-${mode}`,
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
      include: [
        'element-plus',
        '@element-plus/icons-vue',
        'dompurify',
        'markdown-it',
        'katex',
        'highlight.js/lib/core',
      ],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/element-plus/')) return 'element-plus'
            if (id.includes('node_modules/@element-plus/icons-vue')) return 'element-plus-icons'
            if (id.includes('node_modules/echarts/')) return 'echarts'
            if (
              id.includes('node_modules/d3/') ||
              id.includes('node_modules/internmap/') ||
              id.includes('node_modules/delaunator/')
            )
              return 'd3'
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
      warmup: {
        clientFiles: ['./src/main.ts', './src/views/HomeView.vue', './src/views/DocumentView.vue'],
      },
      proxy: {
        '/api': {
          target: 'http://192.168.31.178:8001',
          changeOrigin: true,
        },
        '/instance': {
          target: 'http://192.168.31.178:8001',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/instance/, ''),
        },
        '/opencode': {
          target: 'http://192.168.31.178:8001',
          changeOrigin: true,
        },
        '/task': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/task/, '/api'),
        },
        '/document': {
          target: ragProxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/document(?=\/|$)/, '/api'),
        },
      },
    },
  }
})
