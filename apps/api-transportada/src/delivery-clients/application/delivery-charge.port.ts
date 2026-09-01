/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DeliveryChargeOrigin,
  DeliveryChargeStatus,
  DeliveryChargeType,
} from '../../database/delivery-client.schema.js'

export type DeliveryCharge = {
  readonly amount: string
  readonly batchId: string | null
  readonly chargedOn: string
  readonly chargeType: DeliveryChargeType
  readonly contractorId: string | null
  readonly deliveryClientId: string
  readonly id: string
  readonly notes: string
  readonly origin: DeliveryChargeOrigin
  readonly rejectionReason: string
  readonly status: DeliveryChargeStatus
  readonly tripDocumentId: string | null
  readonly tripId: string | null
}

export type DeliveryChargePage = {
  readonly items: readonly DeliveryCharge[]
  readonly nextCursor: string | null
}

export type DeliveryChargeListFilters = {
  readonly contractorId?: string
  readonly cursor?: string
  readonly deliveryClientId?: string
  readonly from?: string
  readonly limit: number
  readonly status?: DeliveryChargeStatus
  readonly to?: string
}

/**
 * Spec 060 D1b: **o contratante vem do emitente da nota**, nunca de uma escolha na tela. Escolher à
 * mão num lote de 38 lançamentos é escolher errado uma vez e descobrir no fechamento.
 */
export type ChargeParties = {
  readonly contractorId: string | null
  readonly deliveryClientId: string
  readonly tripId: string | null
}

export type DeliveryChargeRepositoryPort = {
  /** `null` quando a nota não está nesta viagem/empresa, ou quando o destinatário não tem cadastro. */
  findChargeParties(input: {
    readonly companyId: string
    readonly tripDocumentId: string
  }): Promise<ChargeParties | null>
  findById(input: {
    readonly companyId: string
    readonly id: string
  }): Promise<DeliveryCharge | null>
  insert(input: {
    readonly actorUserId: string | null
    readonly charge: {
      readonly amount: string
      readonly chargedOn: string
      readonly chargeType: DeliveryChargeType
      readonly notes: string
      readonly origin: DeliveryChargeOrigin
      readonly parties: ChargeParties
      readonly status: DeliveryChargeStatus
      readonly tripDocumentId: string | null
    }
    readonly companyId: string
  }): Promise<DeliveryCharge | null>
  list(input: {
    readonly companyId: string
    readonly filters: DeliveryChargeListFilters
  }): Promise<DeliveryChargePage>
  /** Aplica a transição já validada pela máquina, com trilha. `null` quando a linha sumiu. */
  transition(input: {
    readonly actorUserId: string | null
    readonly amount?: string
    readonly companyId: string
    readonly decidedByToken?: string
    readonly eventName: string
    readonly id: string
    readonly rejectionReason?: string
    readonly status: DeliveryChargeStatus
  }): Promise<DeliveryCharge | null>
}

export type DeliveryChargeRule = {
  readonly active: boolean
  readonly chargeType: DeliveryChargeType
  readonly deliveryClientId: string
  readonly expectedAmount: string
  readonly id: string
}

export type DeliveryChargeRuleRepositoryPort = {
  deactivate(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly ruleId: string
  }): Promise<boolean>
  listActiveByClient(input: {
    readonly companyId: string
    readonly deliveryClientId: string
  }): Promise<readonly DeliveryChargeRule[]>
  listByClient(input: {
    readonly companyId: string
    readonly deliveryClientId: string
  }): Promise<readonly DeliveryChargeRule[]>
  upsert(input: {
    readonly actorUserId: string
    readonly chargeType: DeliveryChargeType
    readonly companyId: string
    readonly deliveryClientId: string
    readonly expectedAmount: string
  }): Promise<DeliveryChargeRule>
}
