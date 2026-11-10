import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    globals: true,
    root: './',
    coverage: {
      include: ['src/**/*.ts'],
      reportsDirectory: './coverage',
    },
  },
  plugins: [
    // Build the test files with SWC so Nest's decorator metadata is emitted
    swc.vite({
      // Set the module type explicitly so it isn't inherited from a .swcrc file
      module: { type: 'es6' },
    }),
  ],
});
