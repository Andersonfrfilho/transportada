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

export type ContractorPortalRepositoryPort = {
  listDeliveries(input: {
    readonly context: CompanyContext
    readonly limit: number
    readonly scope: ContractorScope
  }): Promise<readonly ContractorDelivery[]>
  resolveScope(input: { readonly context: CompanyContext }): Promise<ContractorScope>
}
