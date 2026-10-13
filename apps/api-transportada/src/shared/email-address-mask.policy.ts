/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O endereço em claro nunca sai da API nem entra em log: só esta forma mascarada.
 */
export function maskEmailAddress(email: string): string {
  const [local, domain] = email.split('@')
  if (local === undefined || domain === undefined) return email

  const separatorIndex = domain.indexOf('.')
  const domainSuffix = separatorIndex === -1 ? '' : domain.slice(separatorIndex)
  return `${local.slice(0, 1)}***@${domain.slice(0, 1)}***${domainSuffix}`
}
