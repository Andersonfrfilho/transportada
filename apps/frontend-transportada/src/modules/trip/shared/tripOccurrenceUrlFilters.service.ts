/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripOccurrenceFeedFilters } from './tripOccurrenceFeed.service'

/**
 * Spec 248 RF5: o filtro "Atrasadas" vive na URL da lista (`?contractorReply=overdue`), para o link da lista já filtrada
 * poder ser colado e para recarregar a página não perder o recorte. Só esse filtro vai à URL; os outros seguem no estado
 * da tela. Valor desconhecido é ignorado (lista inteira), nunca erro: o link pode ter vindo de uma versão futura.
 */
export const TRIP_OCCURRENCE_URL_CONTRACTOR_REPLY_KEY = 'contractorReply'
export const TRIP_OCCURRENCE_URL_CONTRACTOR_REPLY_OVERDUE = 'overdue'

export function readTripOccurrenceUrlFilters(
  search: string,
): Pick<TripOccurrenceFeedFilters, 'contractorReplyOverdue'> {
  const value = new URLSearchParams(search).get(TRIP_OCCURRENCE_URL_CONTRACTOR_REPLY_KEY)
  return { contractorReplyOverdue: value === TRIP_OCCURRENCE_URL_CONTRACTOR_REPLY_OVERDUE }
}

/** Devolve a query da URL com o filtro aplicado, sem tocar nos outros parâmetros (`tab`, por exemplo). */
export function writeTripOccurrenceUrlFilters(
  input: Readonly<{
    filters: Pick<TripOccurrenceFeedFilters, 'contractorReplyOverdue'>
    search: string
  }>,
): string {
  const params = new URLSearchParams(input.search)
  if (input.filters.contractorReplyOverdue) {
    params.set(
      TRIP_OCCURRENCE_URL_CONTRACTOR_REPLY_KEY,
      TRIP_OCCURRENCE_URL_CONTRACTOR_REPLY_OVERDUE,
    )
  } else {
    params.delete(TRIP_OCCURRENCE_URL_CONTRACTOR_REPLY_KEY)
  }
  const next = params.toString()
  return next.length === 0 ? '' : `?${next}`
}
