/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T19: o fechamento passou a ser por seleção, com filtros — decisão do usuário registrada
 * em `plan.md` § "O fechamento é por seleção, com filtros". A consulta lista as cobranças de
 * ocorrência **sem lote** (o recorte de elegibilidade é `batchId is null`, nunca "do mês corrente"),
 * para o operador escolher exatamente o que entra no próximo `extra_charge_batches`.
 */
import type {
  DeliveryChargeStatus,
  DeliveryChargeType,
} from '../../database/delivery-client.schema.js'

export type OccurrenceChargeReportRow = {
  readonly accessKey: string | null
  readonly amount: string
  readonly chargeType: DeliveryChargeType
  readonly chargedOn: string
  readonly contractorId: string | null
  readonly hasSettlement: boolean
  readonly id: string
  readonly noteNumber: string | null
  readonly noteSeries: string | null
  readonly occurrenceId: string | null
  readonly status: DeliveryChargeStatus
  readonly tripDocumentId: string | null
}

export type OccurrenceChargeReportTotals = {
  readonly byChargeType: readonly {
    readonly amount: string
    readonly chargeType: DeliveryChargeType
    readonly count: number
  }[]
  readonly totalAmount: string
  readonly totalCount: number
}

export type OccurrenceChargeReportFilters = {
  readonly chargeType?: DeliveryChargeType
  readonly contractorId?: string
  readonly cursor?: string
  readonly from?: string
  readonly hasSettlement?: boolean
  readonly limit: number
  readonly search?: string
  readonly status?: DeliveryChargeStatus
  readonly to?: string
}

export type OccurrenceChargeReportPage = {
  readonly items: readonly OccurrenceChargeReportRow[]
  readonly nextCursor: string | null
  readonly totals: OccurrenceChargeReportTotals
}

export type OccurrenceChargeReportPort = {
  read(input: {
    readonly companyId: string
    readonly filters: OccurrenceChargeReportFilters
  }): Promise<OccurrenceChargeReportPage>
}
