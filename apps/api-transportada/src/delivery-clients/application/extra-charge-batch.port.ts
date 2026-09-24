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

/**
 * O fechamento é por seleção (spec 164, plan.md "O fechamento é por seleção, com filtros"): quando
 * `chargeIds` vem preenchido, só essas linhas entram, e o período gravado é o intervalo que cobre
 * exatamente as linhas escolhidas — nunca o período pedido no corpo. `selection_ineligible` cobre
 * qualquer id fora do contratante, já com lote, ou fora de `recorded`: a requisição inteira recua.
 */
export type ExtraChargeBatchCloseOutcome =
  | { readonly kind: 'closed'; readonly batch: ExtraChargeBatch }
  | { readonly kind: 'empty' }
  | { readonly kind: 'selection_ineligible' }

export type ExtraChargeBatchRepositoryPort = {
  /**
   * Fecha o período numa transação: cria o lote, prende os lançamentos elegíveis do contratante e
   * soma o total no banco. Sem `chargeIds`, o recorte é a janela `periodStart..periodEnd` (o
   * comportamento de sempre). Com `chargeIds`, o recorte é exatamente essa lista — validada,
   * fechada e presa na mesma transação.
   */
  close(input: {
    readonly accessToken: string
    readonly actorUserId: string
    readonly chargeIds?: readonly string[]
    readonly companyId: string
    readonly contractorId: string
    readonly periodEnd: string
    readonly periodStart: string
  }): Promise<ExtraChargeBatchCloseOutcome>
  findByToken(input: {
    readonly accessToken: string
  }): Promise<{ readonly batchId: string; readonly companyId: string } | null>
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
