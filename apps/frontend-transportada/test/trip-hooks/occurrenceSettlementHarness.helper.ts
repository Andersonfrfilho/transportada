/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T5.4: o painel de acerto da tratativa montado de verdade, com a API dublada. ⚠️ `mock.module` não
 * se desfaz e vale para o processo inteiro: o cliente do feed e a consulta do usuário são trocados **uma vez**,
 * aqui, e cada teste só reconfigura `settlementFakes`. Sem dublê configurado, valem os reais.
 */
import { mock } from 'bun:test'

import type { TripOccurrenceFeedClient } from '@/modules/trip/shared/tripOccurrenceFeedClient.service'
import type {
  OccurrenceSettlementItem,
  OccurrenceSettlementView,
} from '@/modules/trip/shared/tripOccurrenceFeed.service'

type SettlementClient = Pick<
  TripOccurrenceFeedClient,
  'findOccurrenceSettlement' | 'recordOccurrenceSettlement'
>

export const settlementFakes: {
  client: SettlementClient | undefined
  recorded: readonly OccurrenceSettlementItem[][]
  saved: OccurrenceSettlementView
} = { client: undefined, recorded: [], saved: { items: [], total: '0.0000' } }

export function installSettlementDouble(
  saved: OccurrenceSettlementView = { items: [], total: '0.0000' },
): void {
  settlementFakes.saved = saved
  settlementFakes.recorded = []
  settlementFakes.client = {
    findOccurrenceSettlement: () => Promise.resolve(settlementFakes.saved),
    recordOccurrenceSettlement: (input) => {
      settlementFakes.recorded = [...settlementFakes.recorded, [...input.items]]
      return Promise.resolve({ items: input.items, total: '0.0000' })
    },
  }
}

export function resetSettlementDouble(): void {
  settlementFakes.client = undefined
  settlementFakes.recorded = []
}

/** ⚠️ O original é guardado ANTES do `mock.module`: depois dele o export do módulo já é o falso, e chamá-lo recursa. */
const feedClientModule = await import('@/modules/trip/shared/tripOccurrenceFeedClient.service')
const createRealFeedClient = feedClientModule.createTripOccurrenceFeedClient
void mock.module('@/modules/trip/shared/tripOccurrenceFeedClient.service', () => ({
  ...feedClientModule,
  createTripOccurrenceFeedClient: (
    ...args: Parameters<typeof feedClientModule.createTripOccurrenceFeedClient>
  ) => {
    const real = createRealFeedClient(...args)
    return settlementFakes.client === undefined ? real : { ...real, ...settlementFakes.client }
  },
}))

const authMeModule = await import('@/modules/identity/queries/useAuthMe.query')
/** Sem o prefixo `use`: a escolha entre o real e o falso é a mesma durante todo um teste, então a ordem dos hooks não muda. */
const realAuthMeQuery = authMeModule.useAuthMeQuery
void mock.module('@/modules/identity/queries/useAuthMe.query', () => ({
  ...authMeModule,
  useAuthMeQuery: () =>
    settlementFakes.client === undefined
      ? realAuthMeQuery()
      : { data: { data: { permissions: [] } } },
}))

const environmentModule = await import('@/modules/identity/shared/identityEnvironment.config')
const readRealEnvironment = environmentModule.getIdentityEnvironment
void mock.module('@/modules/identity/shared/identityEnvironment.config', () => ({
  ...environmentModule,
  getIdentityEnvironment: () =>
    settlementFakes.client === undefined
      ? readRealEnvironment()
      : {
          apiBaseUrl: 'https://api.example.test',
          appBaseUrl: 'https://app.example.test',
          keycloak: { clientId: 'client', realm: 'realm', url: 'https://sso.example.test' },
        },
}))
