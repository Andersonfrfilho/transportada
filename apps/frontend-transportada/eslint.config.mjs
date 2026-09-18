import eslint from '@eslint/js'
import globals from 'globals'
import typescriptEslint from 'typescript-eslint'

export default typescriptEslint.config(
  {
    ignores: [
      'dev-dist/**',
      'dist/**',
      'eslint.config.mjs',
      'node_modules/**',
      /** Runtime de terceiro servido como asset: é binário e bundle minificado, não código nosso. */
      'public/background-removal/**',
      /** Motor de OCR do canhoto (spec 156 T14): worker e core minificados, modelo binário. */
      'public/canhoto-ocr/**',
      /** Build próprio do OpenCV (ADR-0065): saída do Emscripten, conferida por sha256. */
      'vendor/opencv/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  eslint.configs.recommended,
  ...typescriptEslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
)
