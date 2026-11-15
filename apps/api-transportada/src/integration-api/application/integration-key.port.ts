/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { IntegrationKeyScope } from '../../database/integration-api-key.schema.js'

export type IntegrationKeyRecord = {
  readonly companyId: string
  readonly createdAt: Date
  readonly createdByUserId: string
  readonly id: string
  readonly keyPrefix: string
  readonly lastUsedAt: Date | null
  readonly name: string
  readonly revokedAt: Date | null
  readonly scopes: readonly IntegrationKeyScope[]
}

export type IntegrationKeyAuditEntry = {
  readonly action: string
  readonly actorUserId: string
  readonly after: Readonly<Record<string, unknown>>
  readonly before: Readonly<Record<string, unknown>> | null
  readonly companyId: string
  readonly correlationId: string
  readonly keyId: string
}

export type IntegrationKeyRepositoryPort = {
  appendAudit(entry: IntegrationKeyAuditEntry): Promise<void>
  create(input: {
    readonly companyId: string
    readonly createdByUserId: string
    readonly keyHash: string
    readonly keyPrefix: string
    readonly name: string
    readonly scopes: readonly IntegrationKeyScope[]
  }): Promise<IntegrationKeyRecord>
  /** Só chave não revogada. Marca `last_used_at` no máximo uma vez por minuto (a leitura não vira escrita a cada chamada). */
  findActiveByHash(input: {
    readonly keyHash: string
    readonly now: Date
  }): Promise<IntegrationKeyRecord | null>
  list(input: { readonly companyId: string }): Promise<readonly IntegrationKeyRecord[]>
  /** `null` quando a chave não é da empresa ou já estava revogada. */
  revoke(input: {
    readonly companyId: string
    readonly id: string
    readonly now: Date
  }): Promise<IntegrationKeyRecord | null>
}
