/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (T4.4): o que o registro de nota do motorista devolve — a mesma forma na primeira resposta
 * e no reenvio pela chave (`findDocumentOccurrenceById`), as duas lidas do banco.
 */
import type { TripOccurrence } from './register-trip-occurrence.use-case.js'

export type DriverDocumentOccurrenceItem = {
  readonly declaredAmount: null | string
  readonly productCode: string
  readonly quantity: null | string
  readonly quantityUnit: null | string
  readonly unitValue: null | string
}

export type DriverDocumentOccurrence = TripOccurrence & {
  readonly declaredAmount: null | string
  /** Vazia é a nota inteira, ou o item único do app anterior (lido da coluna `product_code`). */
  readonly items: readonly DriverDocumentOccurrenceItem[]
  readonly referenceNumber: null | string
}

/** A linha a gravar: preço e unidade já resolvidos da nota, no servidor. */
export type DriverDocumentOccurrenceLineInput = {
  readonly declaredAmount: null | string
  readonly productCode: string
  readonly quantity: string
  readonly quantityUnit: string
  readonly unitValue: string
}
