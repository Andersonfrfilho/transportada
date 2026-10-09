/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  HolidayProviderRequest,
  ProviderHolidayEntry,
} from '../domain/holiday-provider.types.js'

/**
 * `receivedCount` é o que o fornecedor mandou, antes de descartar e juntar: é ele que diz se há mais
 * páginas. `discardedCount` são as datas de outro ano que o pedido (ausente = nenhuma).
 */
export type HolidayProviderPage = {
  readonly discardedCount?: number
  readonly entries: readonly ProviderHolidayEntry[]
  readonly receivedCount: number
}

export type HolidayProviderClient = {
  fetchPage(request: HolidayProviderRequest): Promise<HolidayProviderPage>
}
