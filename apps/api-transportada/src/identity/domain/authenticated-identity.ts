/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type AuthenticatedIdentity = {
  /**
   * A verified token selection only. It is not a tenant context until T011
   * confirms the active company membership in PostgreSQL.
   *
   * ADR-0047: **`null` só para service account.** Um token de gente fica preso a uma empresa pela
   * claim; o do serviço não pode, porque o worker processa CT-e de todas — e um cliente do Keycloak
   * por tenant exigiria provisionamento por empresa. Para ele a empresa chega no pedido, e continua
   * sendo validada contra a membership real, exatamente como a de gente.
   */
  readonly companyIdClaim: string | null
  readonly externalIdentityId: string
  readonly issuer: string
  readonly platformAdmin: boolean
  /**
   * ADR-0047 §2: reconhecido por papel de realm, pela mesma porta que o `platform-admin` já usa.
   * Nenhuma estrutura nova de reconhecimento, e nenhum caminho de autenticação escrito por nós.
   */
  readonly serviceAccount: boolean
  readonly subject: string
  readonly userId: string
}
