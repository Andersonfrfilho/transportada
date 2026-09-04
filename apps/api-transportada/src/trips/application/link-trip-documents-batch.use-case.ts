/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import type { TripDocument } from './trip.port.js'

/**
 * ⚠️ **Nota já vinculada não derruba o lote.** Montar uma viagem com trezentas notas é o caso real
 * da 075, e o operador acrescenta o mesmo maço duas vezes o tempo todo — recusar as trezentas por
 * causa de uma repetida transformaria um clique em caça ao duplicado.
 */
export type LinkTripDocumentsBatchSkip = {
  readonly nfeDocumentId: string
  readonly reason: 'already_linked' | 'not_found'
}

export type LinkTripDocumentsBatchResult = {
  readonly linked: readonly TripDocument[]
  readonly skipped: readonly LinkTripDocumentsBatchSkip[]
  readonly tripStatus: TripStatus
}

/**
 * O escopo mínimo do lote no banco: **uma** transação, **um** lock da viagem e a inserção do maço
 * inteiro. É isto que faz o custo parar de crescer com o tamanho do maço — o vínculo um a um
 * pagava uma transação e um lock por nota, e trezentas notas eram trezentas idas ao servidor.
 */
export type LinkTripDocumentsBatchPort = {
  linkDocumentsBatch(input: {
    readonly companyId: string
    readonly nfeDocumentIds: readonly string[]
    readonly tripId: string
  }): Promise<LinkTripDocumentsBatchResult>
}

export type LinkTripDocumentsBatchInput = {
  readonly context: { readonly companyId: string }
  readonly nfeDocumentIds: readonly string[]
  readonly tripId: string
}

export type LinkTripDocumentsBatchUseCase = {
  execute(input: LinkTripDocumentsBatchInput): Promise<LinkTripDocumentsBatchResult>
}

export function createLinkTripDocumentsBatchUseCase(dependencies: {
  readonly repository: LinkTripDocumentsBatchPort
}): LinkTripDocumentsBatchUseCase {
  return {
    async execute(input) {
      /**
       * A chave repetida dentro do próprio corpo é do cliente, não do banco: a busca por filtro e o
       * bipe podem trazer a mesma nota, e mandá-la duas vezes faria a segunda colidir com a
       * primeira **da mesma transação** — um erro que não diz nada ao operador.
       */
      const unique = [...new Set(input.nfeDocumentIds)]
      return dependencies.repository.linkDocumentsBatch({
        companyId: input.context.companyId,
        nfeDocumentIds: unique,
        tripId: input.tripId,
      })
    },
  }
}
