/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Ajuste manual do cursor da distribuição — a saída para o que a ressincronização
 * automática do worker não cobrir. Salto de cursor, portanto: abre janela de uma hora
 * (regra 3 da spec 030) e deixa trilha, porque pular NSU custa documentos.
 */
import {
  distributionCursorAboveMaxNsu,
  distributionCursorNotFound,
} from '../domain/distribution-cursor.error.js'
import type {
  DistributionCursorAuditPort,
  DistributionCursorRepositoryPort,
} from './distribution-cursor.port.js'
import {
  toDistributionCursorStatus,
  type DistributionCursorStatus,
} from './get-distribution-cursor.use-case.js'

const AUDIT_ACTION = 'nfe-distribution-cursor.adjusted'

export type AdjustDistributionCursorInput = {
  readonly companyId: string
  readonly correlationId: string
  readonly ultNsu: string
  readonly userId: string
}

export function createAdjustDistributionCursorUseCase(dependencies: {
  readonly audit: DistributionCursorAuditPort
  readonly clock: { readonly now: () => Date }
  readonly repository: DistributionCursorRepositoryPort
}): {
  readonly execute: (input: AdjustDistributionCursorInput) => Promise<DistributionCursorStatus>
} {
  return {
    execute: async (input) => {
      const current = await dependencies.repository.find({ companyId: input.companyId })
      if (current === null) throw distributionCursorNotFound()
      // NSU é sempre 15 dígitos com zero à esquerda: comparar como texto é comparar como número.
      if (input.ultNsu > current.maxNsu) throw distributionCursorAboveMaxNsu()

      const adjusted = await dependencies.repository.jump({
        companyId: input.companyId,
        now: dependencies.clock.now(),
        ultNsu: input.ultNsu,
      })
      await dependencies.audit.append({
        action: AUDIT_ACTION,
        actorUserId: input.userId,
        companyId: input.companyId,
        correlationId: input.correlationId,
        fromUltNsu: current.ultNsu,
        toUltNsu: adjusted.ultNsu,
      })
      return toDistributionCursorStatus(adjusted)
    },
  }
}
