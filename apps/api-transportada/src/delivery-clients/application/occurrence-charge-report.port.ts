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
import type { StopOccurrencePaidBy } from '../../database/trip.schema.js'
import type { PixKeyType } from '../../shared/pix-key-type.constant.js'

/**
 * Spec 317 (T6): a cobrança no recebimento (`receiving_charge`) chega aos Ressarcimentos com quem pagou, o PIX do
 * motorista e o comprovante já enviado. ⚠️ O PIX é dado financeiro: só sai nesta rota (`trip.financials`).
 */
export type OccurrenceChargeReportReceivingCharge = {
  readonly driverPayoutSentAt: string | null
  readonly driverPixKey: string | null
  readonly driverPixKeyType: PixKeyType | null
  readonly paidBy: StopOccurrencePaidBy | null
}

/** Spec 317 (T6): a foto de cada vaga, com link assinado de 5 min (`inline`). */
export type OccurrenceChargeReportPhoto = {
  readonly expiresAt: string
  readonly label: string
  readonly slotKey: string
  readonly url: string
}

/** O que o repositório devolve da foto: onde ela está. Quem assina é o caso de uso. */
export type OccurrenceChargeReportPhotoLocation = {
  readonly bucket: string
  readonly label: string
  readonly objectKey: string
  readonly slotKey: string
}

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
  /** Spec 317: fotos das vagas da ocorrência de parada; vazio nas cobranças de nota. */
  readonly photos: readonly OccurrenceChargeReportPhoto[]
  readonly receivingCharge: OccurrenceChargeReportReceivingCharge | null
  readonly status: DeliveryChargeStatus
  readonly stopOccurrenceId: string | null
  readonly tripDocumentId: string | null
  readonly tripId: string | null
}

export type OccurrenceChargeReportRecord = Omit<OccurrenceChargeReportRow, 'photos'> & {
  readonly photos: readonly OccurrenceChargeReportPhotoLocation[]
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

export type OccurrenceChargeReportRecordPage = Omit<OccurrenceChargeReportPage, 'items'> & {
  readonly items: readonly OccurrenceChargeReportRecord[]
}

export type OccurrenceChargeReportPort = {
  read(input: {
    readonly companyId: string
    readonly filters: OccurrenceChargeReportFilters
  }): Promise<OccurrenceChargeReportRecordPage>
}

export type OccurrenceChargeReportPhotoDownloadPort = {
  createDownloadUrl(location: {
    readonly bucket: string
    readonly fileName: string
    readonly objectKey: string
  }): Promise<{ readonly expiresAt: string; readonly url: string }>
}
