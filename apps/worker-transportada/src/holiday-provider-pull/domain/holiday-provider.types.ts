/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { HolidayProviderScope, HolidayProviderType } from './holiday-provider.constant.js'

/** `ibgeCode`: cidade com 7 dígitos, estado com os 2 da UF, nacional `BR`. */
export type HolidayProviderRequest = {
  readonly ibgeCode: string
  readonly page: number
  readonly scope: HolidayProviderScope
  readonly year: number
}

/** O que o fornecedor mandou de cada data, já limpo (data ISO, nome aparado e limitado). */
export type ProviderHolidayItem = {
  readonly date: string
  readonly externalId: string | null
  readonly isBanking: boolean
  readonly name: string
  readonly providerType: HolidayProviderType
}

/** Uma data já com a chave com que o cache a guarda: o estadual de uma resposta de cidade vem como `state` + UF. */
export type ProviderHolidayEntry = ProviderHolidayItem & {
  readonly ibgeCode: string
  readonly scope: HolidayProviderScope
}
