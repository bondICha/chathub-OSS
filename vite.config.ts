import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

// Webview bundle only. The extension host is bundled separately by esbuild.mjs.
// The HTML document is generated at runtime by src/extension/html.ts, which
// expects stable file names: assets/index.js and assets/index.css.
export default defineConfig(({ mode }) => {
  return {
    // relative base + <base href> in the generated HTML makes lazy chunks,
    // fonts and workers resolve inside the webview
    base: './',
    plugins: [tsconfigPaths(), react()],
    build: {
      outDir: 'dist/webview',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          index: 'src/webview/main.tsx',
        },
        output: {
          entryFileNames: 'assets/index.js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: (assetInfo) =>
            assetInfo.name?.endsWith('.css') ? 'assets/index[extname]' : 'assets/[name]-[hash][extname]',
          manualChunks: {
            vendor: ['react', 'react-dom'],
            icons: ['react-icons'],
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
    esbuild: {
      drop: mode === 'production' ? ['console', 'debugger'] : [],
    },
  }
})
