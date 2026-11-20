// ESLint for the extension (npm run lint). Type-aware rules from
// typescript-eslint, kept to the ones that find real bugs: promises nobody
// handles, objects turned into "[object Object]", unsafe any. Run from
// extension/: the paths below are relative to it.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export default tseslint.config(
  { ignores: ['build/**', '.wxt/**', '.output/**', 'coverage/**', 'node_modules/**', 'tools/lint/**', 'public/**', '**/*.min.*'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, chrome: 'readonly' },
      parserOptions: { project: resolve(root, 'tsconfig.json'), tsconfigRootDir: root },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: true } }],
      // TypeScript already checks these.
      'no-undef': 'off',
      'no-redeclare': 'off',
      // Tests and DOM code assert freely; these are style, not bugs.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    // Tests poke at loosely typed DOM and JSON.
    files: ['tests/**'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
