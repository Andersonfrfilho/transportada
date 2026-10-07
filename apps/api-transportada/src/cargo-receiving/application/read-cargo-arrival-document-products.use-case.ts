/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2b (ADR-0094 §9): os itens da nota que só está em chegada, para o formulário de avaria
 * listar o que o separador pode marcar. A chegada de outra empresa e a nota que não é dela são 404
 * com códigos distintos; nota sem item é lista vazia.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { TripDocumentProduct } from '../../trips/application/read-trip-document-products.use-case.js'
import {
  CargoArrivalDocumentNotFoundError,
  CargoArrivalNotFoundError,
} from '../domain/cargo-arrival.error.js'
import type { CargoArrivalDocumentProductsReadPort } from './cargo-arrival-occurrence.port.js'

export type ListCargoArrivalDocumentProductsParams = {
  readonly arrivalId: string
  readonly context: CompanyContext
  readonly documentId: string
}

export function createListCargoArrivalDocumentProductsUseCase(dependencies: {
  readonly reads: CargoArrivalDocumentProductsReadPort
}): {
  readonly execute: (
    params: ListCargoArrivalDocumentProductsParams,
  ) => Promise<readonly TripDocumentProduct[]>
} {
  return {
    async execute({ arrivalId, context, documentId }) {
      const result = await dependencies.reads.listArrivalDocumentProducts({
        arrivalId,
        companyId: context.companyId,
        nfeDocumentId: documentId,
      })
      if (result.outcome === 'arrival-not-found') throw new CargoArrivalNotFoundError()
      if (result.outcome === 'document-not-found') throw new CargoArrivalDocumentNotFoundError()
      return result.products
    },
  }
}
