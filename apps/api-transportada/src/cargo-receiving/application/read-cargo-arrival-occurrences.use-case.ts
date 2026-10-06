/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2: as leituras da ocorrência de recebimento, sempre pela empresa do contexto. A
 * chegada de outra empresa é 404, igual à inexistente.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { CargoArrivalNotFoundError } from '../domain/cargo-arrival.error.js'
import type { CargoArrivalOccurrenceReadPort } from './cargo-arrival-occurrence.port.js'
import type {
  CargoArrivalOccurrencesView,
  ReceivingOccurrenceTypeView,
} from './cargo-arrival-occurrence.types.js'

export type ListCargoArrivalOccurrencesParams = {
  readonly arrivalId: string
  readonly context: CompanyContext
  readonly documentId: string | null
}

export function createListCargoArrivalOccurrencesUseCase(dependencies: {
  readonly reads: CargoArrivalOccurrenceReadPort
}): {
  readonly execute: (
    params: ListCargoArrivalOccurrencesParams,
  ) => Promise<CargoArrivalOccurrencesView>
} {
  return {
    async execute({ arrivalId, context, documentId }) {
      const view = await dependencies.reads.listOccurrences({
        arrivalId,
        companyId: context.companyId,
        nfeDocumentId: documentId,
      })
      if (view === null) throw new CargoArrivalNotFoundError()
      return view
    },
  }
}

export function createListReceivingOccurrenceTypesUseCase(dependencies: {
  readonly reads: CargoArrivalOccurrenceReadPort
}): {
  readonly execute: (params: {
    readonly context: CompanyContext
  }) => Promise<readonly ReceivingOccurrenceTypeView[]>
} {
  return {
    execute: ({ context }) => dependencies.reads.listReceivingTypes(context.companyId),
  }
}
