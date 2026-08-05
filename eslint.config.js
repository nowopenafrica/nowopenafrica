import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      // Deno edge functions run in a different runtime with their own types;
      // they aren't part of the browser bundle and shouldn't be linted here.
      'supabase/functions/**',
      // Build/test tooling config files.
      '**/*.config.{js,ts}',
      // Standalone Node utility scripts (not part of the app bundle).
      'scripts/**',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Pragmatic for a Supabase-backed app: `any` shows up around dynamic DB
      // rows and third-party payloads. Keep it visible as a warning rather
      // than a build-blocking error, so CI stays green while flagging it.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Real dead-code signal, but allow intentionally-unused names prefixed _.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  }
);
