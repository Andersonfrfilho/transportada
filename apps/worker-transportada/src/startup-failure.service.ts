/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
/**
 * O boot que morre só dizia `worker_startup_failed`, e foi assim que a mesma falha apareceu em dois
 * jobs de CI sem causa à vista. Sai o nome, o `code` e a mensagem, com qualquer credencial de URL
 * (`://usuário:senha@`) mascarada; nunca o objeto inteiro, que pode carregar configuração.
 */
export function describeStartupFailure(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  const message = error instanceof Error ? error.message : ''
  return [name, code, message]
    .filter((part) => part !== '')
    .join(' ')
    .replace(/:\/\/[^\s/@]*@/gu, '://***@')
    .slice(0, 500)
}
