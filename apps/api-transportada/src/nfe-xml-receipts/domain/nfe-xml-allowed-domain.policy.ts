/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 313: o domínio que a empresa libera a enviar XML. Provedor público (gmail e afins) nunca é liberado inteiro —
 * a lista é a mesma do CHECK `nfe_xml_allowed_email_domains_public_provider_check`.
 */
export const NFE_XML_PUBLIC_EMAIL_PROVIDERS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.com.br',
  'icloud.com',
  'me.com',
  'bol.com.br',
  'uol.com.br',
  'terra.com.br',
  'ig.com.br',
  'globo.com',
  'protonmail.com',
  'proton.me',
  'aol.com',
])

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

/** Aceita `@spani.com.br`, `SPANI.com.br` e `fulano@spani.com.br`; devolve só o domínio minúsculo, ou `null` se inválido. */
export function normalizeAllowedDomain(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  const domain = at === -1 ? trimmed : trimmed.slice(at + 1)
  return domain.length <= 253 && DOMAIN_PATTERN.test(domain) ? domain : null
}
