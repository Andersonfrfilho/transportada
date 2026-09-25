import eslint from '@eslint/js'
import globals from 'globals'
import typescriptEslint from 'typescript-eslint'

export default typescriptEslint.config(
  {
    ignores: ['dev-dist/**', 'dist/**', 'eslint.config.mjs', 'node_modules/**'],
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
      /**
       * Nenhuma app importa código-fonte de outra (ADR-0075 §7): o que vem do painel ou do portal é
       * cópia por valor, dentro desta app. `@/…` que não resolva já falha o `tsc`; esta regra cobre
       * o caminho relativo que escaparia da árvore desta app antes de chegar lá.
       */
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/frontend-*/**'],
              message: 'Cópia por valor (ADR-0075 §7) — nunca import de outra app.',
            },
          ],
        },
      ],
    },
  },
)
