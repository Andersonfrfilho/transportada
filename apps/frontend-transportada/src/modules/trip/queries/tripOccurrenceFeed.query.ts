/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createTripOccurrenceFeedClient,
  type TripOccurrenceFeedClient,
} from '../shared/tripOccurrenceFeedClient.service'
import {
  serializeTripOccurrenceQuery,
  TRIP_OCCURRENCE_PER_PAGE,
  type TripOccurrenceAttachment,
  type TripOccurrenceDetail,
  type TripOccurrenceFeedFilters,
  type TripOccurrenceFeedOrder,
  type TripOccurrenceFeedPage,
} from '../shared/tripOccurrenceFeed.service'

export const TRIP_OCCURRENCE_FEED_QUERY_KEY = 'trip-occurrence-feed'
export const TRIP_OCCURRENCE_ATTACHMENTS_QUERY_KEY = 'trip-occurrence-attachments'
export const TRIP_OCCURRENCE_SETTLEMENT_QUERY_KEY = 'trip-occurrence-settlement'

export function getTripOccurrenceFeedClient(): TripOccurrenceFeedClient {
  return createTripOccurrenceFeedClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

export type UseTripOccurrenceFeedInput = Readonly<{
  companyId?: string
  enabled: boolean
  filters: TripOccurrenceFeedFilters
  order: TripOccurrenceFeedOrder
}>

/** "Carregar mais" acumula páginas: cursor de uma consulta não vale para outra — a chave reseta. */
export function useTripOccurrenceFeedQuery(input: UseTripOccurrenceFeedInput) {
  const client = getTripOccurrenceFeedClient()
  const filterKey = serializeTripOccurrenceQuery({
    cursor: null,
    filters: input.filters,
    order: input.order,
    perPage: TRIP_OCCURRENCE_PER_PAGE,
  })

  return useInfiniteQuery({
    enabled: input.enabled,
    getNextPageParam: (lastPage: TripOccurrenceFeedPage) => lastPage.nextCursor,
    initialPageParam: null as null | string,
    queryFn: ({ pageParam }) =>
      client.listOccurrences({
        cursor: pageParam,
        filters: input.filters,
        order: input.order,
        perPage: TRIP_OCCURRENCE_PER_PAGE,
      }),
    queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY, input.companyId, filterKey],
  })
}

/**
 * A releitura das URLs assinadas fora de uma consulta do TanStack: o painel da nota recebe os
 * anexos embutidos no detalhe da ocorrência, sem consulta própria para invalidar — quando a URL
 * vence, o que ele precisa é da rota de anexos, e só dela.
 */
export function loadTripOccurrenceAttachments(
  occurrenceId: string,
): Promise<readonly TripOccurrenceAttachment[]> {
  return getTripOccurrenceFeedClient().listAttachments({ occurrenceId })
}

export type UseTripOccurrenceAttachmentsInput = Readonly<{
  enabled: boolean
  occurrenceId: string
}>

/** A URL assinada vive cinco minutos — a consulta não é reaproveitada além disso. */
export function useTripOccurrenceAttachmentsQuery(input: UseTripOccurrenceAttachmentsInput) {
  const client = getTripOccurrenceFeedClient()

  return useQuery({
    enabled: input.enabled,
    gcTime: 0,
    queryFn: () => client.listAttachments({ occurrenceId: input.occurrenceId }),
    queryKey: [TRIP_OCCURRENCE_ATTACHMENTS_QUERY_KEY, input.occurrenceId],
    staleTime: 0,
  })
}

export type UseOccurrenceSettlementInput = Readonly<{ enabled: boolean; occurrenceId: string }>

/**
 * Achado 2 da revisão (spec 164): `GET .../case/settlement` — o painel abre com o acerto já
 * gravado em vez de sempre vazio. `gcTime`/`staleTime` zerados: o valor gravado por outra sessão
 * não deve sobreviver em cache além da abertura do painel.
 */
export function useOccurrenceSettlementQuery(input: UseOccurrenceSettlementInput) {
  const client = getTripOccurrenceFeedClient()

  return useQuery({
    enabled: input.enabled,
    gcTime: 0,
    queryFn: () => client.findOccurrenceSettlement({ occurrenceId: input.occurrenceId }),
    queryKey: [TRIP_OCCURRENCE_SETTLEMENT_QUERY_KEY, input.occurrenceId],
    staleTime: 0,
  })
}

/**
 * Spec 183 T204: o detalhe da ocorrência. A chave fica **debaixo** da chave da listagem, para que as
 * ações da tratativa — que invalidam `[TRIP_OCCURRENCE_FEED_QUERY_KEY]` — atualizem a página também.
 */
export function useTripOccurrenceDetailQuery(
  input: Readonly<{ companyId?: string; enabled: boolean; occurrenceId: string }>,
) {
  const client = getTripOccurrenceFeedClient()

  return useQuery<TripOccurrenceDetail>({
    enabled: input.enabled,
    queryFn: () => client.readOccurrence({ occurrenceId: input.occurrenceId }),
    queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY, 'detail', input.companyId, input.occurrenceId],
  })
}
