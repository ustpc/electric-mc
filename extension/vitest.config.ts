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
      // coverage can't slide unnoticed. The background and content script are
      // covered by the linkage tests (tests/background.test.ts,
      // tests/content.test.ts, with tests/fakechrome.ts); the side panel isn't yet.
      thresholds: {
        'lib/**': { lines: 80, statements: 78, functions: 75, branches: 70 },
        'parsers/**': { lines: 90, statements: 85, functions: 90, branches: 75 },
        'entrypoints/background.ts': { lines: 60, statements: 55, functions: 38, branches: 42 },
        'entrypoints/content.ts': { lines: 45, statements: 43, functions: 38, branches: 33 },
      },
    },
  },
});
