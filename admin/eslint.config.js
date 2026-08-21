import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist', 'coverage'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Core `no-unused-vars` does not treat the object of a JSX member
      // expression as a reference, so `<motion.div>` left `motion` looking
      // unused. This rule — which the storefront config already has — records
      // JSX identifiers as uses. It changes no runtime behaviour.
      'react/jsx-uses-vars': 'error',
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // Tests and tooling config run in Node, not in the browser.
    files: ['src/test/**/*.{js,jsx}', '**/*.test.{js,jsx}', 'vitest.config.js', 'vite.config.js', 'eslint.config.js', 'postcss.config.js', 'tailwind.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
]
