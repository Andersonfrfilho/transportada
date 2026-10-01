import eslint from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
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
  {
    /**
     * T905 (P12): só `rules-of-hooks`/`exhaustive-deps` — não o config `recommended-latest` do
     * pacote v7 inteiro, que traz regras do React Compiler (`purity`, `immutability`,
     * `set-state-in-render`, ...) sem relação com o que a T804/T903 afinaram à mão nos arrays de
     * dependência.
     *
     * As duas ficam `warn`, não `error`: `rules-of-hooks` já achou hook condicional real em
     * `TripCargoLayers.component.tsx`, fora do raio desta task (T905 corrige só o que a spec 153
     * tocou) — `error` derrubaria `bun run lint` por um achado que vira task própria, em vez de
     * servir de rede de proteção para o que roda daqui pra frente.
     */
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
    },
  },
)
