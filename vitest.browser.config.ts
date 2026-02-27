import { defineConfig } from 'vitest/config';
import path from 'path';

const zenfsCorePath = path.resolve(__dirname, 'packages/core/node_modules/@zenfs/core');
const zenfsDomPath = path.resolve(__dirname, 'packages/core/node_modules/@zenfs/dom');

export default defineConfig({
  resolve: {
    alias: [
      // ZenFS subpath exports — must come before main alias
      { find: '@zenfs/core/path', replacement: path.join(zenfsCorePath, 'dist/path.js') },
      { find: '@zenfs/core/constants', replacement: path.join(zenfsCorePath, 'dist/constants.js') },
      { find: '@zenfs/core/promises', replacement: path.join(zenfsCorePath, 'dist/node/promises.js') },
      { find: '@zenfs/core', replacement: zenfsCorePath },
      { find: '@zenfs/dom', replacement: zenfsDomPath },
      { find: 'quickjs-emscripten', replacement: path.resolve(__dirname, 'packages/core/node_modules/quickjs-emscripten') },
    ],
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
