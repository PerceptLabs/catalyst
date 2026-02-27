import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@zenfs/core': path.resolve(__dirname, 'packages/core/node_modules/@zenfs/core'),
      '@zenfs/dom': path.resolve(__dirname, 'packages/core/node_modules/@zenfs/dom'),
      'quickjs-emscripten': path.resolve(__dirname, 'packages/core/node_modules/quickjs-emscripten'),
    },
  },
  optimizeDeps: {
    exclude: [
      'quickjs-emscripten',
      '@jitl/quickjs-wasmfile-release-sync',
      '@jitl/quickjs-wasmfile-release-asyncify',
      '@jitl/quickjs-wasmfile-debug-sync',
      '@jitl/quickjs-wasmfile-debug-asyncify',
    ],
  },
  assetsInclude: ['**/*.wasm'],
  test: {
    include: ['packages/*/src/**/*.browser.test.ts', 'spike/**/*.browser.test.ts'],
    exclude: ['**/node_modules/**'],
    browser: {
      enabled: true,
      headless: true,
      provider: 'playwright',
      instances: [
        { browser: 'chromium' },
      ],
    },
  },
});
