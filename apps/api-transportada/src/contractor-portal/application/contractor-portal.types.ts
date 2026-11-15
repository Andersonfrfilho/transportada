/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { ContractorScope } from '../domain/contractor-scope.policy.js'

/**
 * ADR-0050 §4: o **payload mínimo**. Aqui não entra id de viagem, id de vínculo, nome de motorista,
 * placa, valor de frete nem documento de terceiro — o contratante acompanha a carga dele, e cada
 * campo a mais é um campo que vaza a operação da transportadora para fora dela.
 *
 * `separationStatus` e `tripStatus` são nulos enquanto a nota não entrou em viagem: nota importada
 * e ainda parada é estado legítimo, e é o que o portal chama de "recebida".
 */
export type ContractorDelivery = {
  readonly accessKey: string
  readonly deliveredAt: string | null
  readonly documentId: string
  readonly estimatedArrivalAt: string | null
  readonly issuedAt: string
  readonly number: string
  readonly returnReason: string | null
  readonly separationStatus: string | null
  readonly series: string
  readonly tripStatus: string | null
}

/**
 * Spec 340 D4: os marcos da entrega, numa **lista fechada**. A coordenada é a da **parada de destino**
 * (a do endereço geocodificado), nunca a de quem dirige; sem placa, motorista, valor nem trajeto.
 */
export const CONTRACTOR_DELIVERY_EVENT_KINDS = [
  'received',
  'separated',
  'loaded',
  'en_route',
  'arrived',
  'delivered',
  'returned',
] as const

export type ContractorDeliveryEventKind = (typeof CONTRACTOR_DELIVERY_EVENT_KINDS)[number]

export type ContractorDeliveryEvent = {
  readonly kind: ContractorDeliveryEventKind
  readonly occurredAt: string
}

export type ContractorDeliveryEvents = {
  readonly destination: { readonly latitude: string; readonly longitude: string } | null
  readonly events: readonly ContractorDeliveryEvent[]
}

export type ContractorScheduleTarget = {
  /** Nulo enquanto a parada não foi reconciliada — a nota está na viagem, a parada ainda não. */
  readonly stopId: string | null
  readonly tripId: string
}

export type ContractorPortalRepositoryPort = {
  /** `null` quando a chave não é de nota dele, não existe, ou a nota ainda não entrou em viagem. */
  findScheduleTarget(input: {
    readonly accessKey: string
    readonly context: CompanyContext
    readonly scope: ContractorScope
  }): Promise<ContractorScheduleTarget | null>
  /** `null` quando a chave não é de nota dele ou não existe — as duas respondem igual. */
  listDeliveryEvents(input: {
    readonly accessKey: string
    readonly context: CompanyContext
    readonly scope: ContractorScope
  }): Promise<ContractorDeliveryEvents | null>
  isBatchWithinScope(input: {
    readonly batchId: string
    readonly context: CompanyContext
    readonly scope: ContractorScope
  }): Promise<boolean>
  listBatchIds(input: {
    readonly context: CompanyContext
    readonly limit: number
    readonly scope: ContractorScope
  }): Promise<readonly string[]>
  listDeliveries(input: {
    readonly context: CompanyContext
    readonly limit: number
    readonly scope: ContractorScope
  }): Promise<readonly ContractorDelivery[]>
  resolveScope(input: { readonly context: CompanyContext }): Promise<ContractorScope>
}
