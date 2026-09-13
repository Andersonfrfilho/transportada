import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'
import { TRIP_DETAIL } from './trip.fixture'

const adapters = createTripResponseAdapters()

const READY_STATE = {
  computedAt: '2026-09-12T12:00:00.000Z',
  errorCode: null,
  stale: false,
  status: 'ready',
  truncated: false,
} as const

const PREVIEW = {
  cargoLayout: null,
  cargoWeight: null,
  occupancy: null,
  weightConcentration: null,
} as const

function acceptsDetail(data: unknown): boolean {
  try {
    adapters.tripDetailFromApi(data)
    return true
  } catch {
    return false
  }
}

function acceptsPreview(data: unknown): boolean {
  try {
    adapters.tripCargoPreviewFromApi(data)
    return true
  } catch {
    return false
  }
}

function withoutState(): Record<string, unknown> {
  const detail: Record<string, unknown> = { ...TRIP_DETAIL }
  Reflect.deleteProperty(detail, 'cargoLayoutState')
  return detail
}

const INVALID_STATES: ReadonlyArray<readonly [string, unknown]> = [
  ['status desconhecido', { ...READY_STATE, status: 'running' }],
  ['campo a mais', { ...READY_STATE, layoutId: 'x' }],
  ['campo faltando', { computedAt: null, errorCode: null, stale: false, status: 'pending' }],
  ['`stale` não booleano', { ...READY_STATE, stale: 'false' }],
  ['`truncated` não booleano', { ...READY_STATE, truncated: 1 }],
  ['`computedAt` numérico', { ...READY_STATE, computedAt: 0 }],
  ['`errorCode` numérico', { ...READY_STATE, errorCode: 0 }],
  ['não objeto', 'ready'],
]

/**
 * Spec 145 D17: a API vai servir `cargoLayoutState` no detalhe e `{ layoutId, state }` na prévia
 * (T10/T11). `hasKeys` recusa a resposta inteira por chave desconhecida, então o bundle que aceita
 * vai para o ar **antes** da API que serve. Ausente é API antiga; presente com forma errada reprova.
 */
describe('o detalhe aceita `cargoLayoutState` antes de a API servir (spec 145 D17)', () => {
  it('aceita o detalhe sem a chave, como a API atual o serve', () => {
    expect(acceptsDetail(withoutState())).toBe(true)
  })

  for (const status of ['ready', 'pending', 'failed', 'unavailable'] as const) {
    it(`aceita o estado \`${status}\``, () => {
      expect(acceptsDetail({ ...TRIP_DETAIL, cargoLayoutState: { ...READY_STATE, status } })).toBe(
        true,
      )
    })
  }

  /** A coluna é `text not null default ''`: o vazio chega como string, não como `null`. */
  it('aceita `errorCode` vazio, com código e `computedAt` nulo', () => {
    const failed = {
      ...READY_STATE,
      computedAt: null,
      errorCode: 'CARGO_LAYOUT_FAILED',
      stale: true,
      status: 'failed',
      truncated: true,
    }
    expect(acceptsDetail({ ...TRIP_DETAIL, cargoLayoutState: failed })).toBe(true)
    expect(
      acceptsDetail({ ...TRIP_DETAIL, cargoLayoutState: { ...READY_STATE, errorCode: '' } }),
    ).toBe(true)
  })

  for (const [label, state] of INVALID_STATES) {
    it(`reprova o detalhe com ${label}`, () => {
      expect(acceptsDetail({ ...TRIP_DETAIL, cargoLayoutState: state })).toBe(false)
    })
  }

  it('reprova `cargoLayoutState` nulo: a API sempre serve o objeto quando serve a chave', () => {
    expect(acceptsDetail({ ...TRIP_DETAIL, cargoLayoutState: null })).toBe(false)
  })
})

describe('a prévia aceita `{ layoutId, state }` antes de a API servir (spec 145 D17)', () => {
  it('aceita a prévia sem as chaves, como a API atual a serve', () => {
    expect(acceptsPreview(PREVIEW)).toBe(true)
  })

  it('aceita e propaga `layoutId` e `state` válidos', () => {
    const preview = adapters.tripCargoPreviewFromApi({
      ...PREVIEW,
      layoutId: 'layout-1',
      state: { ...READY_STATE, status: 'pending' },
    })

    expect(preview.layoutId).toBe('layout-1')
    expect(preview.state?.status).toBe('pending')
  })

  it('não inventa as chaves quando a API antiga não as serve', () => {
    const preview = adapters.tripCargoPreviewFromApi(PREVIEW)

    expect('layoutId' in preview).toBe(false)
    expect('state' in preview).toBe(false)
  })

  for (const [label, state] of INVALID_STATES) {
    it(`reprova a prévia com ${label}`, () => {
      expect(acceptsPreview({ ...PREVIEW, layoutId: 'layout-1', state })).toBe(false)
    })
  }

  it('reprova `layoutId` que não é string', () => {
    expect(acceptsPreview({ ...PREVIEW, layoutId: 7, state: READY_STATE })).toBe(false)
  })
})
