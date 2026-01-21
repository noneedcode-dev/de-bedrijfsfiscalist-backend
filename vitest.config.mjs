import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    pool: 'threads',
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
