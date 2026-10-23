import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 15000,
    hookTimeout: 15000,
    fileParallelism: false, // Run test files sequentially to prevent database connection contention
  },
});
