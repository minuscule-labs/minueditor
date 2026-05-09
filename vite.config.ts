import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

function copyThemeFiles() {
  return {
    name: 'copy-theme-files',
    async writeBundle() {
      const outDir = resolve(__dirname, 'dist/themes')
      await mkdir(outDir, { recursive: true })
      await cp(resolve(__dirname, 'src/theme/themes'), outDir, { recursive: true })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    copyThemeFiles(),
    dts({
      include: ['src'],
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
      name: 'MinuEditor',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css' || assetInfo.name === 'minueditor.css') {
            return 'theme.css'
          }
          return assetInfo.name ?? 'asset'
        },
      },
    },
    sourcemap: false,
    copyPublicDir: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
