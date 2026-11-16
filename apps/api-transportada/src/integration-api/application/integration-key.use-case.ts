/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { IntegrationKeyScope } from '../../database/integration-api-key.schema.js'
import {
  IntegrationKeyNotFoundError,
  IntegrationScopeForbiddenError,
  IntegrationUnauthorizedError,
} from '../domain/integration-api.error.js'
import {
  generateIntegrationKey,
  hashIntegrationKey,
  integrationKeyHasScope,
  readIntegrationKey,
} from '../domain/integration-key.policy.js'
import type { IntegrationKeyRecord, IntegrationKeyRepositoryPort } from './integration-key.port.js'

type Clock = () => Date
type Dependencies = { readonly clock?: Clock; readonly repository: IntegrationKeyRepositoryPort }

type Actor = {
  readonly companyId: string
  readonly correlationId: string
  readonly userId: string
}

/** Cria a chave. O texto inteiro volta só aqui; depois só o prefixo existe. */
export function createCreateIntegrationKeyUseCase(dependencies: Dependencies): (
  input: Actor & {
    readonly name: string
    readonly scopes: readonly IntegrationKeyScope[]
  },
) => Promise<{ readonly plainKey: string; readonly record: IntegrationKeyRecord }> {
  return async (input) => {
    const generated = generateIntegrationKey()
    const record = await dependencies.repository.create({
      companyId: input.companyId,
      createdByUserId: input.userId,
      keyHash: generated.hash,
      keyPrefix: generated.prefix,
      name: input.name,
      scopes: input.scopes,
    })
    await dependencies.repository.appendAudit({
      action: 'integration-key.created',
      actorUserId: input.userId,
      // Nunca a chave nem o hash: só o que identifica e limita.
      after: { name: record.name, prefix: record.keyPrefix, scopes: record.scopes },
      before: null,
      companyId: input.companyId,
      correlationId: input.correlationId,
      keyId: record.id,
    })
    return { plainKey: generated.plain, record }
  }
}

export function createListIntegrationKeysUseCase(
  dependencies: Pick<Dependencies, 'repository'>,
): (input: { readonly companyId: string }) => Promise<readonly IntegrationKeyRecord[]> {
  return (input) => dependencies.repository.list(input)
}

export function createRevokeIntegrationKeyUseCase(
  dependencies: Dependencies,
): (input: Actor & { readonly id: string }) => Promise<IntegrationKeyRecord> {
  const now = dependencies.clock ?? (() => new Date())
  return async (input) => {
    const revoked = await dependencies.repository.revoke({
      companyId: input.companyId,
      id: input.id,
      now: now(),
    })
    if (revoked === null) throw new IntegrationKeyNotFoundError()
    await dependencies.repository.appendAudit({
      action: 'integration-key.revoked',
      actorUserId: input.userId,
      after: { revoked: true },
      before: { revoked: false },
      companyId: input.companyId,
      correlationId: input.correlationId,
      keyId: revoked.id,
    })
    return revoked
  }
}

/** Quem chama uma rota de integração: a chave resolvida e a empresa dela. Nunca vem do corpo. */
export type IntegrationCaller = {
  readonly companyId: string
  /** Quem criou a chave: é o autor registrado na auditoria (a chave não é uma pessoa e `audit_logs` exige uma). */
  readonly createdByUserId: string
  readonly keyId: string
  readonly scopes: readonly IntegrationKeyScope[]
}

export function createAuthenticateIntegrationKeyUseCase(
  dependencies: Dependencies,
): (input: {
  readonly authorization: string | null
  readonly scope: IntegrationKeyScope
}) => Promise<IntegrationCaller> {
  const now = dependencies.clock ?? (() => new Date())
  return async ({ authorization, scope }) => {
    const plain = readIntegrationKey(authorization)
    if (plain === null) throw new IntegrationUnauthorizedError()
    const record = await dependencies.repository.findActiveByHash({
      keyHash: hashIntegrationKey(plain),
      now: now(),
    })
    if (record === null) throw new IntegrationUnauthorizedError()
    if (!integrationKeyHasScope(record.scopes, scope)) throw new IntegrationScopeForbiddenError()
    return {
      companyId: record.companyId,
      createdByUserId: record.createdByUserId,
      keyId: record.id,
      scopes: record.scopes,
    }
  }
}
