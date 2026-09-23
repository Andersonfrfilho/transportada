/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 168: a porta que `createReadCargoLayoutUseCase` usa para achar a caixa de cada pendência de
 * medição — implementada por `DrizzlePackageBoxRepository.findBoxIdsForPendingMeasurements`. Vive em
 * `trips/application` (e não em `nfe-documents`) porque é o consumidor, não o dono do dado, que
 * declara o formato que precisa; o valor do mapa (`PendingMeasurementBoxMatch`) é de quem dono do
 * dado, e por isso é reexportado de lá.
 */
import type { PendingMeasurementBoxMatch } from '../../nfe-documents/application/package-box.port.js'

export type { PendingMeasurementBoxMatch }

export type PendingMeasurementBoxLookupItem = {
  readonly documentNumber: string | null
  readonly productCode: string | null
}

export type PendingMeasurementBoxLookupPort = {
  /** A chave do mapa é `buildPendingMeasurementBoxKey`; sem entrada, a pendência fica sem caixa. */
  findBoxIdsForPendingMeasurements(input: {
    readonly companyId: string
    readonly items: readonly PendingMeasurementBoxLookupItem[]
  }): Promise<ReadonlyMap<string, PendingMeasurementBoxMatch>>
}
