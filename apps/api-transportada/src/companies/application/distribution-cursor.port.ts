/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeFiscalEnvironment } from '../../database/nfe.schema.js'

export type DistributionCursorSkip = {
  readonly at: Date
  readonly fromNsu: string
  readonly toNsu: string
}

export type DistributionCursorRecord = {
  readonly companyId: string
  readonly consecutiveRateLimits: number
  readonly environment: NfeFiscalEnvironment
  readonly lastSkipped: DistributionCursorSkip | undefined
  readonly maxNsu: string
  readonly nextAllowedAt: Date | undefined
  readonly ultNsu: string
  readonly updatedAt: Date
}

export type DistributionCursorJumpInput = {
  readonly companyId: string
  readonly now: Date
  readonly ultNsu: string
}

export type DistributionCursorRepositoryPort = {
  find(input: { readonly companyId: string }): Promise<DistributionCursorRecord | null>
  /**
   * NT 2014.002 §3.11.4.1: consultar dentro do bloqueio corrente zera a contagem da SEFAZ. Por isso
   * o salto grava `ultNsu` e abre a janela de uma hora no mesmo comando — não existe caminho que
   * mova o cursor fora de sequência sem ela.
   */
  jump(input: DistributionCursorJumpInput): Promise<DistributionCursorRecord>
}

export type DistributionCursorAuditEntry = {
  readonly action: string
  readonly actorUserId: string
  readonly companyId: string
  readonly correlationId: string
  readonly fromUltNsu: string
  readonly toUltNsu: string
}

export type DistributionCursorAuditPort = {
  append(entry: DistributionCursorAuditEntry): Promise<void>
}
