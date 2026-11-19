import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'parsers/**/*.ts', 'entrypoints/**/*.{ts,tsx}'],
      reporter: ['text', 'html', 'json', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      // A floor under the tested layers, a little below today's numbers, so
      // coverage can't slide unnoticed. The entrypoints aren't covered yet.
      thresholds: {
        'lib/**': { lines: 80, statements: 78, functions: 75, branches: 70 },
        'parsers/**': { lines: 90, statements: 85, functions: 90, branches: 75 },
      },
    },
  },
});
