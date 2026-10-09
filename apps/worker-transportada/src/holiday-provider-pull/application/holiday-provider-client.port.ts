/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  HolidayProviderRequest,
  ProviderHolidayEntry,
} from '../domain/holiday-provider.types.js'

/** `receivedCount` é o que o fornecedor mandou, antes de descartar e juntar: é ele que diz se há mais páginas. */
export type HolidayProviderPage = {
  readonly entries: readonly ProviderHolidayEntry[]
  readonly receivedCount: number
}

export type HolidayProviderClient = {
  fetchPage(request: HolidayProviderRequest): Promise<HolidayProviderPage>
}
