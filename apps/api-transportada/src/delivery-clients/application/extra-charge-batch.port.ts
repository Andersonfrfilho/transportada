/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DeliveryChargeType,
  ExtraChargeBatchStatus,
} from '../../database/delivery-client.schema.js'

export type ExtraChargeBatch = {
  readonly closedAt: string
  readonly contractorId: string
  readonly id: string
  readonly periodEnd: string
  readonly periodStart: string
  readonly status: ExtraChargeBatchStatus
  /** Dinheiro é texto de `numeric` do começo ao fim: nenhuma soma passa por ponto flutuante. */
  readonly totalAmount: string
}

export type ExtraChargeBatchReportItem = {
  readonly amount: string
  readonly chargedOn: string
  readonly chargeType: DeliveryChargeType
  readonly clientName: string
  readonly clientTaxId: string
  readonly id: string
  readonly notes: string
  readonly rejectionReason: string
  readonly status: string
}

export type ExtraChargeBatchReport = {
  readonly batch: ExtraChargeBatch
  readonly contractorName: string
  readonly items: readonly ExtraChargeBatchReportItem[]
  /** Recalculado da lista, não lido do lote: o relatório confere o próprio total. */
  readonly itemsTotal: string
}

export type ExtraChargeDecision = {
  readonly chargeId: string
  readonly decision: 'approved' | 'rejected'
  readonly reason: string
}

export type ExtraChargeBatchRepositoryPort = {
  /**
   * Fecha o período numa transação: cria o lote, prende os lançamentos `recorded` do contratante
   * naquela janela e soma o total no banco. `null` quando não havia nada a fechar.
   */
  close(input: {
    readonly accessToken: string
    readonly actorUserId: string
    readonly companyId: string
    readonly contractorId: string
    readonly periodEnd: string
    readonly periodStart: string
  }): Promise<ExtraChargeBatch | null>
  findByToken(input: { readonly accessToken: string }): Promise<
    { readonly batchId: string; readonly companyId: string } | null
  >
  readReport(input: {
    readonly batchId: string
    readonly companyId: string
  }): Promise<ExtraChargeBatchReport | null>
  /** Gira o token e devolve o novo: fechar o lote de novo invalida o link antigo (ADR-0048 §7). */
  rotateToken(input: {
    readonly accessToken: string
    readonly batchId: string
    readonly companyId: string
  }): Promise<void>
}
