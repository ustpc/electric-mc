import { defineConfig } from 'vitest/config';

// Tests on real Manuscript Central data that lives only on the developer's
// computer, in ../var (git-ignored): `npm run test:real`. They skip when
// that data isn't there (as in CI). They never print what they read: each
// check reports counts and MC's page names only. See tests-real/README.md.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests-real/**/*.test.ts'],
    testTimeout: 60_000,
    // A failing expect() prints the values it compared; these tests compare
    // only counts and booleans, and this keeps any diff short as well.
    printConsoleTrace: false,
  },
});
