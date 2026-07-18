/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import eslint from '@eslint/js'
import globals from 'globals'
import typescriptEslint from 'typescript-eslint'

export default typescriptEslint.config(
  eslint.configs.recommended,
  ...typescriptEslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: globals.bunBuiltin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    ignores: ['dist/**'],
  },
)
