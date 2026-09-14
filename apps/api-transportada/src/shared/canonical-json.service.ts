/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Serialização determinística: mesmo dado, sempre o mesmo texto — chave de objeto ordenada
 * recursivamente, e é isso que faz um hash sobre o resultado dizer "é o mesmo input" e não "é o
 * mesmo input com as chaves na mesma ordem de inserção".
 */

function canonicalizeArray(value: readonly unknown[]): string {
  return `[${value.map((item) => canonicalize(item) ?? 'null').join(',')}]`
}

function canonicalizeObject(value: Readonly<Record<string, unknown>>): string {
  const entries = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)

  return `{${entries.join(',')}}`
}

function canonicalize(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return canonicalizeArray(value)
  if (typeof value === 'object') return canonicalizeObject(value as Record<string, unknown>)

  throw new Error(`canonicalJson: valor não serializável (${typeof value})`)
}

/** `undefined` na raiz não tem chave para omitir — vira `null`, como o resto da árvore. */
export function canonicalJson(value: unknown): string {
  return canonicalize(value) ?? 'null'
}
