import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist', 'coverage'] },
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: '18.3' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/jsx-no-target-blank': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Tests and tooling config run in Node, not in the browser.
    // `e2e/**` is the Playwright harness: it starts processes, reads `/proc`
    // and signals process groups, none of which exists in a browser.
    // `scripts/**` is local tooling — the bundle budget report and the media
    // optimiser — and runs under Node like the rest of this list.
    files: ['src/test/**/*.{js,jsx}', '**/*.test.{js,jsx}', 'e2e/**/*.{js,mjs}', 'scripts/**/*.{js,mjs}', 'playwright.config.js', 'vitest.config.js', 'vite.config.js', 'eslint.config.js', 'postcss.config.js', 'tailwind.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
]
