import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://taxi:taxi@localhost:5432/taxi_test',
    },
    fileParallelism: false, // API tests share one test database
    testTimeout: 15000,
  },
});
