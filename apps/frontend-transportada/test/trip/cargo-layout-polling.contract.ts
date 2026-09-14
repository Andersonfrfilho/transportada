/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  mergeCargoPreviewPoll,
  resolveCargoLayoutRefetchInterval,
  resolveCargoLayoutView,
  resolveCargoPreviewPollLayoutId,
  trackCargoLayoutPendingEpisode,
} from '../../src/modules/trip/shared/cargoLayoutPolling.service'
import {
  CARGO_LAYOUT_POLL_CEILING_MS,
  CARGO_LAYOUT_REFETCH_MS,
} from '../../src/modules/trip/shared/trip.constant'
import type {
  CargoLayoutStatus,
  TripCargoLayout,
  TripCargoLayoutState,
  TripCargoPreview,
} from '../../src/modules/trip/shared/trip.types'
import { createTripClient } from '../../src/modules/trip/shared/tripClient.service'
import { resolveTripRefetchInterval } from '../../src/modules/trip/shared/tripPolling.service'
import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()

const START = 1_000_000

const LAYOUT = {
  bedLengthM: null,
  bedSource: null,
  bedWidthM: null,
  freeDepthM: null,
  freeRows: 0,
  occupancyKnown: false,
  orderIsBinding: false,
  overflowDepthM: null,
  overflowM3: '0',
  rows: [],
  stopsWithoutVolume: [],
} as const

function state(status: CargoLayoutStatus, extra: Partial<TripCargoLayoutState> = {}) {
  return {
    computedAt: null,
    errorCode: null,
    stale: false,
    status,
    truncated: false,
    ...extra,
  } satisfies TripCargoLayoutState
}

function preview(layoutId: string, status: CargoLayoutStatus): TripCargoPreview {
  return {
    cargoLayout: null,
    cargoWeight: null,
    layoutId,
    occupancy: null,
    state: state(status),
    weightConcentration: null,
  }
}

function acceptsPoll(data: unknown): boolean {
  try {
    adapters.tripCargoLayoutPollFromApi(data)
    return true
  } catch {
    return false
  }
}

/**
 * Spec 145 D10/D16/D18: enquanto a planta está `pending`, a tela pergunta a cada 3 s; `ready`,
 * `failed` (estável dentro da espera) e `unavailable` encerram; o teto de 10 min vira "tempo
 * esgotado" e para. O relógio é injetado (`now`), para o teto ser testável sem esperar.
 */
describe('o intervalo da planta (spec 145 T12)', () => {
  it('pergunta a cada 3 s só enquanto está `pending`', () => {
    expect(CARGO_LAYOUT_REFETCH_MS).toBe(3_000)
    expect(
      resolveCargoLayoutRefetchInterval({ episode: undefined, now: START, status: 'pending' }),
    ).toBe(3_000)
  })

  it.each(['ready', 'failed', 'unavailable'] as const)('não pergunta em `%s`', (status) => {
    expect(resolveCargoLayoutRefetchInterval({ episode: undefined, now: START, status })).toBe(
      false,
    )
  })

  it('chave ausente (API antiga) não pergunta', () => {
    expect(
      resolveCargoLayoutRefetchInterval({ episode: undefined, now: START, status: undefined }),
    ).toBe(false)
  })

  it('para no teto de 18 min desde o começo do pending', () => {
    expect(CARGO_LAYOUT_POLL_CEILING_MS).toBe(1_080_000)
    const episode = { key: 'trip-1', since: START }
    expect(
      resolveCargoLayoutRefetchInterval({
        episode,
        now: START + CARGO_LAYOUT_POLL_CEILING_MS - 1,
        status: 'pending',
      }),
    ).toBe(3_000)
    expect(
      resolveCargoLayoutRefetchInterval({
        episode,
        now: START + CARGO_LAYOUT_POLL_CEILING_MS,
        status: 'pending',
      }),
    ).toBe(false)
  })
})

describe('o episódio de pending (spec 145 D16)', () => {
  it('começa na primeira resposta `pending` e mantém o início nas seguintes', () => {
    const first = trackCargoLayoutPendingEpisode({
      key: 'trip-1',
      now: START,
      previous: undefined,
      status: 'pending',
    })
    expect(first).toEqual({ key: 'trip-1', since: START })
    const later = trackCargoLayoutPendingEpisode({
      key: 'trip-1',
      now: START + 9_000,
      previous: first,
      status: 'pending',
    })
    expect(later).toBe(first)
  })

  it('zera ao sair de pending: um pending novo conta do zero', () => {
    const first = { key: 'trip-1', since: START }
    const ready = trackCargoLayoutPendingEpisode({
      key: 'trip-1',
      now: START + 500_000,
      previous: first,
      status: 'ready',
    })
    expect(ready).toBeUndefined()
    const again = trackCargoLayoutPendingEpisode({
      key: 'trip-1',
      now: START + 700_000,
      previous: ready,
      status: 'pending',
    })
    expect(again).toEqual({ key: 'trip-1', since: START + 700_000 })
    expect(
      resolveCargoLayoutRefetchInterval({
        episode: again,
        now: START + 700_000 + 3_000,
        status: 'pending',
      }),
    ).toBe(3_000)
  })

  it('outra chave (outra prévia, outra viagem) abre episódio novo', () => {
    const next = trackCargoLayoutPendingEpisode({
      key: 'layout-b',
      now: START + 400_000,
      previous: { key: 'layout-a', since: START },
      status: 'pending',
    })
    expect(next).toEqual({ key: 'layout-b', since: START + 400_000 })
  })
})

describe('o modelo de estado para a tela (spec 145 T12 → T13)', () => {
  it('chave ausente devolve `null`: a tela segue a de hoje', () => {
    expect(
      resolveCargoLayoutView({ episode: undefined, layout: null, now: START, state: undefined }),
    ).toBeNull()
  })

  it('repassa fase, planta, `stale`, `truncated` e o código como a API serviu', () => {
    const layout = LAYOUT as unknown as TripCargoLayout
    expect(
      resolveCargoLayoutView({
        episode: { key: 'trip-1', since: START },
        layout,
        now: START + 3_000,
        state: state('pending', { stale: true, truncated: true }),
      }),
    ).toEqual({
      errorCode: null,
      layout,
      pendingSince: START,
      phase: 'pending',
      stale: true,
      truncated: true,
    })
    expect(
      resolveCargoLayoutView({
        episode: undefined,
        layout: null,
        now: START,
        state: state('failed', { errorCode: 'CARGO_LAYOUT_FAILED' }),
      }),
    ).toEqual({
      errorCode: 'CARGO_LAYOUT_FAILED',
      layout: null,
      phase: 'failed',
      stale: false,
      truncated: false,
    })
  })

  it('pending além do teto vira `timedOut`, com a planta anterior se houver', () => {
    const layout = LAYOUT as unknown as TripCargoLayout
    const view = resolveCargoLayoutView({
      episode: { key: 'trip-1', since: START },
      layout,
      now: START + CARGO_LAYOUT_POLL_CEILING_MS,
      state: state('pending', { stale: true }),
    })
    expect(view?.phase).toBe('timedOut')
    expect(view?.layout).toBe(layout)
  })
})

describe('o detalhe estende o intervalo que já existia (spec 079 + 145)', () => {
  const draft = { documents: [], status: 'draft' }

  it('viagem no galpão com planta `pending` pergunta a cada 3 s', () => {
    expect(
      resolveTripRefetchInterval({
        ...draft,
        cargoLayout: { episode: undefined, now: START, status: 'pending' },
      }),
    ).toBe(3_000)
  })

  it('na rua com planta `pending` vale o menor dos dois', () => {
    expect(
      resolveTripRefetchInterval({
        cargoLayout: { episode: undefined, now: START, status: 'pending' },
        documents: [{ separationStatus: 'loaded' }],
        status: 'dispatched',
      }),
    ).toBe(3_000)
  })

  it.each(['ready', 'failed', 'unavailable'] as const)(
    'planta `%s` não muda o comportamento de hoje',
    (status) => {
      expect(
        resolveTripRefetchInterval({
          ...draft,
          cargoLayout: { episode: undefined, now: START, status },
        }),
      ).toBe(false)
      expect(
        resolveTripRefetchInterval({
          cargoLayout: { episode: undefined, now: START, status },
          documents: [{ separationStatus: 'loaded' }],
          status: 'dispatched',
        }),
      ).toBe(30_000)
    },
  )

  it('chave ausente é o comportamento de hoje', () => {
    expect(
      resolveTripRefetchInterval({
        ...draft,
        cargoLayout: { episode: undefined, now: START, status: undefined },
      }),
    ).toBe(false)
    expect(resolveTripRefetchInterval(draft)).toBe(false)
  })

  it('passado o teto, o detalhe para de perguntar pela planta', () => {
    expect(
      resolveTripRefetchInterval({
        ...draft,
        cargoLayout: {
          episode: { key: 'trip-1', since: START },
          now: START + CARGO_LAYOUT_POLL_CEILING_MS,
          status: 'pending',
        },
      }),
    ).toBe(false)
  })

  it('o hook do detalhe passa o estado da planta ao intervalo e expõe o modelo', () => {
    const source = readFileSync(
      new URL('../../src/modules/trip/hooks/useTripWorkspace.hook.ts', import.meta.url),
      'utf8',
    )
    expect(source).toContain('cargoLayoutState?.status')
    expect(source).toContain('trackCargoLayoutPendingEpisode')
    expect(source).toContain('cargoLayoutView')
  })
})

describe('a prévia pergunta pelo `layoutId` (spec 145 D3/D10)', () => {
  it('pending com `layoutId` pede polling por ele; os demais estados não', () => {
    expect(resolveCargoPreviewPollLayoutId(preview('layout-a', 'pending'))).toBe('layout-a')
    expect(resolveCargoPreviewPollLayoutId(preview('layout-a', 'ready'))).toBeUndefined()
    expect(resolveCargoPreviewPollLayoutId(preview('layout-a', 'failed'))).toBeUndefined()
    expect(resolveCargoPreviewPollLayoutId(null)).toBeUndefined()
    const legacy: TripCargoPreview = {
      cargoLayout: null,
      cargoWeight: null,
      occupancy: null,
      weightConcentration: null,
    }
    expect(resolveCargoPreviewPollLayoutId(legacy)).toBeUndefined()
  })

  it('a resposta do polling do mesmo `layoutId` substitui planta e estado', () => {
    const layout = LAYOUT as unknown as TripCargoLayout
    const merged = mergeCargoPreviewPoll({
      poll: { cargoLayout: layout, layoutId: 'layout-a', state: state('ready') },
      preview: preview('layout-a', 'pending'),
    })
    expect(merged?.cargoLayout).toBe(layout)
    expect(merged?.state?.status).toBe('ready')
  })

  it('trocar a prévia descarta o polling antigo: resposta atrasada não sobrescreve a nova', () => {
    const current = preview('layout-b', 'pending')
    const merged = mergeCargoPreviewPoll({
      poll: {
        cargoLayout: LAYOUT as unknown as TripCargoLayout,
        layoutId: 'layout-a',
        state: state('ready'),
      },
      preview: current,
    })
    expect(merged).toBe(current)
  })

  it('o hook da prévia consulta a rota nova pelo `layoutId` e mescla só pelo mesmo id', () => {
    const source = readFileSync(
      new URL('../../src/modules/trip/hooks/useTripCargoPreview.hook.ts', import.meta.url),
      'utf8',
    )
    expect(source).toContain('useTripCargoLayoutQuery')
    expect(source).toContain('mergeCargoPreviewPoll')
    expect(source).toContain('cargoLayoutView')
  })
})

describe('a resposta de `GET /trips/cargo-layouts/:layoutId` (spec 145 T11)', () => {
  const VALID = { cargoLayout: null, layoutId: 'layout-a', state: state('pending') }

  it('aceita pending sem planta e ready com planta', () => {
    expect(adapters.tripCargoLayoutPollFromApi(VALID)).toEqual(VALID)
    expect(acceptsPoll({ cargoLayout: LAYOUT, layoutId: 'layout-a', state: state('ready') })).toBe(
      true,
    )
  })

  const INVALID: ReadonlyArray<readonly [string, unknown]> = [
    ['chave a mais', { ...VALID, tripId: 'x' }],
    ['chave faltando', { cargoLayout: null, layoutId: 'layout-a' }],
    ['`layoutId` não string', { ...VALID, layoutId: 7 }],
    [
      '`state` com status desconhecido',
      { ...VALID, state: { ...state('ready'), status: 'running' } },
    ],
    ['`state` com chave a mais', { ...VALID, state: { ...state('ready'), layoutId: 'x' } }],
    ['planta estranha', { ...VALID, cargoLayout: { rows: 'x' } }],
    ['não objeto', 'ready'],
  ]

  it.each(INVALID)('recusa %s', (_label, data) => {
    expect(acceptsPoll(data)).toBe(false)
  })

  it('o cliente pergunta com GET pelo id e desembrulha `{ data }`', async () => {
    const requests: Request[] = []
    const client = createTripClient({
      apiUrl: 'http://api.test',
      fetch: (input) => {
        requests.push(input as Request)
        return Promise.resolve(new Response(JSON.stringify({ data: VALID })))
      },
      getAccessToken: () => Promise.resolve('token'),
    })

    expect(await client.readCargoLayout({ layoutId: 'layout-a' })).toEqual(VALID)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.url).toBe('http://api.test/trips/cargo-layouts/layout-a')
  })

  it('o cliente recusa resposta com chave a mais', async () => {
    const client = createTripClient({
      apiUrl: 'http://api.test',
      fetch: () =>
        Promise.resolve(new Response(JSON.stringify({ data: { ...VALID, extra: true } }))),
      getAccessToken: () => Promise.resolve('token'),
    })

    const failure = await client.readCargoLayout({ layoutId: 'layout-a' }).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(Error)
  })
})
