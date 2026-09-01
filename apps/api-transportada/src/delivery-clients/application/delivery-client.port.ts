/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DeliveryClientStatus } from '../../database/delivery-client.schema.js'
import type {
  DeliveryDateException,
  DeliveryWeeklyWindow,
} from '../domain/delivery-window.policy.js'

export type DeliveryClient = {
  readonly defaultServiceTimeMinutes: number | null
  /** Expectativa, não fato. `null` é ausência de regra, e é o caso da maioria. */
  readonly deliveryFeeAmount: string | null
  readonly displayName: string
  readonly id: string
  readonly notes: string
  readonly requiresScheduling: boolean
  readonly status: DeliveryClientStatus
  readonly taxId: string
}

export type DeliveryClientDetail = DeliveryClient & {
  readonly exceptions: readonly DeliveryDateException[]
  readonly windows: readonly DeliveryWeeklyWindow[]
}

export type DeliveryClientPage = {
  readonly items: readonly DeliveryClient[]
  readonly nextCursor: string | null
}

export type DeliveryClientListFilters = {
  readonly cursor?: string
  readonly limit: number
  /** Busca por nome. O **documento** não entra aqui: ele é consultado por igualdade exata. */
  readonly nameContains?: string
  readonly requiresScheduling?: boolean
  readonly status?: DeliveryClientStatus
}

export type DeliveryClientWriteInput = {
  readonly defaultServiceTimeMinutes?: number | null
  readonly deliveryFeeAmount?: string | null
  readonly displayName?: string
  readonly notes?: string
  readonly requiresScheduling?: boolean
  readonly status?: DeliveryClientStatus
}

export type DeliveryClientRepositoryPort = {
  create(input: {
    readonly companyId: string
    readonly taxId: string
    readonly values: DeliveryClientWriteInput
  }): Promise<DeliveryClient>
  /** `null` quando o cliente não existe **nesta empresa** — nunca 403: existir é informação. */
  findById(input: {
    readonly companyId: string
    readonly id: string
  }): Promise<DeliveryClientDetail | null>
  /**
   * Igualdade exata, jamais `LIKE`: o documento é dado de pessoa quando é CPF, e uma busca por
   * prefixo permitiria varrer a base oito dígitos por vez (`security.md` §1).
   */
  findByTaxId(input: {
    readonly companyId: string
    readonly taxId: string
  }): Promise<DeliveryClientDetail | null>
  list(input: {
    readonly companyId: string
    readonly filters: DeliveryClientListFilters
  }): Promise<DeliveryClientPage>
  replaceExceptions(input: {
    readonly companyId: string
    readonly exceptions: readonly DeliveryDateException[]
    readonly id: string
  }): Promise<readonly DeliveryDateException[]>
  /** Substitui a semana inteira: janela é conjunto, e editar item a item deixa órfão. */
  replaceWindows(input: {
    readonly companyId: string
    readonly id: string
    readonly windows: readonly DeliveryWeeklyWindow[]
  }): Promise<readonly DeliveryWeeklyWindow[]>
  update(input: {
    readonly companyId: string
    readonly id: string
    readonly values: DeliveryClientWriteInput
  }): Promise<DeliveryClient | null>
}
