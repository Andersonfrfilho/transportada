/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 057 P2: depois de "Iniciar rota" o detalhe da viagem acompanha os eventos novos sozinho. O
 * corpo da viagem já repetia a consulta desde a 057/079; a linha do tempo (158) nasceu sem
 * `refetchInterval` e ficava congelada no que estava em tela quando a página abriu.
 */
import { describe, expect, test } from 'bun:test'

import { TRIP_ON_THE_ROAD_REFETCH_MS, TRIP_QUERY_KEY } from '@/modules/trip/shared/trip.constant'
import { resolveTripTimelineRefetchInterval } from '@/modules/trip/shared/tripPolling.service'
import type { TripTimelineItem, TripTimelinePage } from '@/modules/trip/shared/trip.types'

import { resetTripHookFakes, tripHookFakes as fakes } from './tripClientMocks.helper'
import { renderHook, waitFor } from './renderHook.helper'

const { TRIP_TIMELINE_QUERY_KEY, useTripTimeline } = await import(
  '@/modules/trip/hooks/useTripTimeline.hook'
)

const TRIP_ID = 'trip-1'
const PERMISSIONS = ['fleet.read']

function nota(separationStatus: string) {
  return { separationStatus }
}

const EMPTY_PAGE: TripTimelinePage = { items: [], nextCursor: null }

async function renderTimeline(
  input: Readonly<{ documents: readonly { separationStatus: string }[]; status: string }>,
) {
  resetTripHookFakes([])
  fakes.tripClient = {
    ...fakes.tripClient,
    readTripTimeline: () => Promise.resolve(EMPTY_PAGE),
  }
  const rendered = await renderHook(() =>
    useTripTimeline({
      permissions: PERMISSIONS,
      tripDocuments: input.documents,
      tripId: TRIP_ID,
      tripStatus: input.status,
    }),
  )
  await waitFor(() => {
    expect(rendered.result().isPending).toBe(false)
  })
  return rendered
}

function readRefetchInterval(rendered: Awaited<ReturnType<typeof renderTimeline>>) {
  const query = rendered.queryClient
    .getQueryCache()
    .find({ queryKey: [TRIP_QUERY_KEY, TRIP_ID, TRIP_TIMELINE_QUERY_KEY] })
  if (query === undefined) throw new Error('TIMELINE_QUERY_NOT_REGISTERED')
  return (query.options as { refetchInterval?: unknown }).refetchInterval
}

describe('a linha do tempo repete a consulta na rua (spec 057 P2)', () => {
  test('em rota de entrega com nota pendente, repete a cada meio minuto', async () => {
    const rendered = await renderTimeline({
      documents: [nota('loaded')],
      status: 'on_delivery_route',
    })

    expect(readRefetchInterval(rendered)).toBe(TRIP_ON_THE_ROAD_REFETCH_MS)
    rendered.unmount()
  })

  /** No galpão quem move a viagem é quem está olhando a tela — e ele já vê o que fez. */
  test('no rascunho, não repete', async () => {
    const rendered = await renderTimeline({ documents: [nota('pending')], status: 'draft' })

    expect(readRefetchInterval(rendered)).toBe(false)
    rendered.unmount()
  })
})

/**
 * A regra é a **mesma** do corpo da viagem, de propósito: duas políticas na mesma tela mostrariam a
 * parada baixada no detalhe e ainda pendente na linha do tempo.
 */
describe('resolveTripTimelineRefetchInterval', () => {
  test('repete nos três estados de rua', () => {
    for (const status of ['dispatched', 'in_transit', 'on_delivery_route']) {
      expect(resolveTripTimelineRefetchInterval({ documents: [nota('loaded')], status })).toBe(
        TRIP_ON_THE_ROAD_REFETCH_MS,
      )
    }
  })

  test('para quando não há mais o que entregar', () => {
    expect(
      resolveTripTimelineRefetchInterval({
        documents: [nota('delivered'), nota('returned')],
        status: 'on_delivery_route',
      }),
    ).toBe(false)
  })

  test('não repete fora da rua', () => {
    expect(
      resolveTripTimelineRefetchInterval({ documents: [nota('loaded')], status: 'separating' }),
    ).toBe(false)
    expect(resolveTripTimelineRefetchInterval({ documents: [], status: undefined })).toBe(false)
  })
})

/**
 * O cursor é posicional: um evento novo no topo empurra os últimos itens da página 1 para dentro da
 * página 2, que segue ancorada no cursor antigo. Sem o corte por `id`, o trilho renderizava dois
 * irmãos com a mesma `key` a cada repetição.
 */
describe('o mesmo evento em duas páginas', () => {
  test('sobrevive uma vez, na posição da primeira aparição', async () => {
    const { removeDuplicateTimelineItems } = await import(
      '@/modules/trip/shared/tripTimeline.service'
    )
    const item = (id: string) => ({ id, kind: 'trip.created' }) as unknown as TripTimelineItem

    const result = removeDuplicateTimelineItems([item('a'), item('b'), item('b'), item('c')])

    expect(result.map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
  })
})
