/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Sem dado pessoal na chave (RF4/plan.md § Worker): nem endereço, nem assunto — só a referência
 * opaca do Resend, que já é única por empresa. O trilho da conversa e o da prévia gravam o MIME aqui.
 */
export function buildRawEmailObjectKey(input: {
  readonly companyId: string
  readonly providerEmailId: string
}): string {
  return `tenants/${input.companyId}/contractor-mail/${encodeURIComponent(input.providerEmailId)}/raw.eml`
}
