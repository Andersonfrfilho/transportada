/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6 (D6): quem ENCAMINHA vale por endereço exato (a equipe); o remetente ORIGINAL vale por
 * endereço exato ou domínio exato (o contratante). Nunca subdomínio nem sufixo, e lista ausente ou
 * vazia recusa tudo: sem lista, a entrada da prévia não abre para ninguém.
 */
export function isForwarderAllowed(input: {
  readonly address: string
  readonly allowlist: readonly string[] | null
}): boolean {
  const address = normalize(input.address)
  if (address === undefined) return false
  return (input.allowlist ?? []).some((entry) => normalize(entry) === address)
}

export function isOriginalSenderAllowed(input: {
  readonly address: string
  readonly allowlist: readonly string[] | null
}): boolean {
  const address = normalize(input.address)
  if (address === undefined) return false
  const domain = address.slice(address.lastIndexOf('@') + 1)
  return (input.allowlist ?? []).some((raw) => {
    const entry = normalize(raw)
    if (entry === undefined) return false
    return entry.includes('@') ? entry === address : entry === domain
  })
}

/**
 * O banco já recusa entrada nula, vazia ou que não é texto (CHECK da lista); isto é a segunda barreira: o que
 * não é texto utilizável é ignorado, nunca lança e nunca vira "vale tudo".
 */
function normalize(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  return normalized.length === 0 ? undefined : normalized
}
