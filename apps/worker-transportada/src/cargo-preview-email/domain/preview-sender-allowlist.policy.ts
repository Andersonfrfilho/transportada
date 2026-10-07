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
  return (input.allowlist ?? []).some((entry) => normalize(entry) === address)
}

export function isOriginalSenderAllowed(input: {
  readonly address: string
  readonly allowlist: readonly string[] | null
}): boolean {
  const address = normalize(input.address)
  const domain = address.slice(address.lastIndexOf('@') + 1)
  return (input.allowlist ?? []).some((raw) => {
    const entry = normalize(raw)
    return entry.includes('@') ? entry === address : entry === domain
  })
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}
