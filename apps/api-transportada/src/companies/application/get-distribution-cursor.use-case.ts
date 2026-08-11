/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Estado do cursor da distribuição para a tela de Configurações: onde a consulta parou,
 * até onde a SEFAZ já serviu, quando a próxima consulta é permitida e o que a
 * ressincronização automática abandonou pelo caminho.
 */
import { distributionCursorNotFound } from '../domain/distribution-cursor.error.js'
import type {
  DistributionCursorRecord,
  DistributionCursorRepositoryPort,
} from './distribution-cursor.port.js'
import type { NfeFiscalEnvironment } from '../../database/nfe.schema.js'

export type DistributionCursorSkipStatus = {
  readonly at: string
  readonly fromNsu: string
  readonly toNsu: string
}

export type DistributionCursorStatus = {
  readonly consecutiveRateLimits: number
  readonly environment: NfeFiscalEnvironment
  readonly lastSkipped: DistributionCursorSkipStatus | undefined
  readonly maxNsu: string
  readonly nextAllowedAt: string | undefined
  readonly ultNsu: string
  readonly updatedAt: string
}

export function toDistributionCursorStatus(
  record: DistributionCursorRecord,
): DistributionCursorStatus {
  return {
    consecutiveRateLimits: record.consecutiveRateLimits,
    environment: record.environment,
    lastSkipped:
      record.lastSkipped === undefined
        ? undefined
        : {
            at: record.lastSkipped.at.toISOString(),
            fromNsu: record.lastSkipped.fromNsu,
            toNsu: record.lastSkipped.toNsu,
          },
    maxNsu: record.maxNsu,
    nextAllowedAt: record.nextAllowedAt?.toISOString(),
    ultNsu: record.ultNsu,
    updatedAt: record.updatedAt.toISOString(),
  }
}

export function createGetDistributionCursorUseCase(dependencies: {
  readonly repository: DistributionCursorRepositoryPort
}): {
  readonly execute: (input: { readonly companyId: string }) => Promise<DistributionCursorStatus>
} {
  return {
    execute: async ({ companyId }) => {
      const record = await dependencies.repository.find({ companyId })
      if (record === null) throw distributionCursorNotFound()
      return toDistributionCursorStatus(record)
    },
  }
}
