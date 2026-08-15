/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A gravação é toda ou nada por chave natural: quem já está lá não é reescrito, e o que o ciclo
 * devolve é quantas referências entraram de fato. Dado público de mercado — sem `companyId`.
 */
import type { FuelProduct } from '../domain/fuel.constant.js'

export type FuelReferenceRecord = {
  readonly pricePerUnit: string
  readonly product: FuelProduct
  readonly state: string
  readonly stationCount: number
  readonly weekEndingOn: string
}

export type FuelReferenceGatewayPort = {
  readonly insertMissing: (input: {
    readonly collectedAt: Date
    readonly references: readonly FuelReferenceRecord[]
  }) => Promise<{ readonly insertedCount: number }>
}
