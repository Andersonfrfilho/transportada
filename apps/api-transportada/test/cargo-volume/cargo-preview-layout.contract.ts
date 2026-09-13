/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { resolveCargoLayout, type ResolvedCargoLayout } from '@adatechnology/cargo-placement'

import {
  previewTripCargo,
  type TripCargoPreviewContext,
} from '../../src/trips/application/preview-trip-cargo.use-case.js'
import { createReadCargoLayoutUseCase } from '../../src/trips/application/read-cargo-layout.use-case.js'
import type { RequestCargoLayoutParams } from '../../src/trips/application/request-cargo-layout.types.js'
import {
  buildCargoLayoutInput,
  buildStoredCargoLayoutInput,
  hashCargoLayoutInput,
} from '../../src/trips/domain/cargo-layout-hash.policy.js'
import type { BuildCargoLayoutInputParams } from '../../src/trips/domain/cargo-layout-hash.types.js'
import type {
  StoredCargoLayoutRecord,
  StoredCargoLayoutRecordWithInput,
} from '../../src/trips/domain/cargo-layout-state.types.js'
import { buildCargoPreviewStops } from '../../src/trips/domain/cargo-preview.policy.js'
import { NEW_INPUT, OLD_INPUT, drawnWith } from '../fixtures/cargo-layout-label.fixture.js'

const COMPANY_ID = 'company-preview'
const CORRELATION_ID = 'correlation-preview-request'
const LAYOUT_ID = '00000000-0000-4000-8000-00000000c145'
const EMPTY_LAYOUT_LISTS = { pendingMeasurements: [], rows: [], slices: [], stopsWithoutVolume: [] }
const STORED_LAYOUT = {
  ...EMPTY_LAYOUT_LISTS,
  placement: { layers: [], source: 'measured', unplaced: [] },
  stored: 'by the worker',
} as unknown as ResolvedCargoLayout

const MEASURED_CONTEXT: TripCargoPreviewContext = {
  bedDimensions: { heightM: '2.500', lengthM: '8.000', source: 'measured', widthM: '2.400' },
  boxesByDocument: new Map(),
  capacityM3: '48.000',
  cargoWeight: null,
  documents: [
    {
      addressKey: 'porta-1',
      clientName: 'Cliente',
      label: 'A',
      nfeDocumentId: 'a',
      number: '10',
      volumeM3: '1.000000',
      weightKilograms: null,
    },
  ],
  enclosedBody: false,
  fallbackBoxVolumeM3: 0.05,
  loadingAccess: 'rear',
  measuredShapes: [],
  occupancy: null,
  securesCargo: false,
}

type PreviewHarness = {
  readonly hashLookups: string[]
  readonly requests: RequestCargoLayoutParams[]
}

function previewWith(params: {
  readonly context: TripCargoPreviewContext
  readonly stored?: StoredCargoLayoutRecord
}): { readonly harness: PreviewHarness; readonly run: () => ReturnType<typeof previewTripCargo> } {
  const harness: PreviewHarness = { hashLookups: [], requests: [] }
  const run = () =>
    previewTripCargo({
      companyId: COMPANY_ID,
      correlationId: CORRELATION_ID,
      driverIds: [],
      layouts: {
        async findById() {
          throw new Error('The preview never looks a layout up by id')
        },
        async findByInputHash(query) {
          expect(query.companyId).toBe(COMPANY_ID)
          harness.hashLookups.push(query.inputHash)
          return params.stored
        },
      },
      nfeDocumentIds: ['a'],
      repository: { readCargoPreviewContext: async () => params.context },
      requestCargoLayout: {
        async execute(request) {
          harness.requests.push(request)
          return { enqueued: true, layoutId: LAYOUT_ID, status: 'queued' }
        },
      },
      stopOrder: [],
      vehicleId: 'vehicle',
    })
  return { harness, run }
}

function storedRow(overrides: Partial<StoredCargoLayoutRecord>): StoredCargoLayoutRecord {
  return {
    computedAt: null,
    errorCode: '',
    id: LAYOUT_ID,
    layout: null,
    leaseExpired: false,
    status: 'queued',
    ...overrides,
  }
}

/** A entrada que a prévia monta do contexto: o mesmo retrato que `resolveCargoLayout` recebia. */
function previewInputOf(context: TripCargoPreviewContext): BuildCargoLayoutInputParams {
  return {
    bedDimensions: context.bedDimensions,
    capacityM3: context.capacityM3,
    enclosedBody: context.enclosedBody,
    fallbackBoxVolumeM3: context.fallbackBoxVolumeM3,
    loadingAccess: context.loadingAccess,
    measuredShapes: context.measuredShapes,
    payloadRatio: null,
    securesCargo: context.securesCargo,
    stops: buildCargoPreviewStops({
      boxesByDocument: context.boxesByDocument,
      documents: context.documents,
      order: [],
    }),
  }
}

/** O hash que a prévia tem de procurar. */
function expectedHash(context: TripCargoPreviewContext): string {
  return hashCargoLayoutInput(buildCargoLayoutInput(previewInputOf(context)))
}

/**
 * Spec 145 D3/D10 (T11): a prévia não empacota na requisição. Ela monta a entrada, resume no hash e
 * lê `trip_cargo_layouts`; o que não está pronto vai para a fila com `tripId null`.
 */
describe('a prévia pede a planta pelo hash (spec 145 T11)', () => {
  test('sem baú: planta leve na hora, unavailable, sem layoutId, sem ler nem enfileirar', async () => {
    const { harness, run } = previewWith({
      context: { ...MEASURED_CONTEXT, bedDimensions: null, capacityM3: null },
    })

    const preview = await run()

    expect(preview.state).toEqual({
      computedAt: null,
      errorCode: null,
      stale: false,
      status: 'unavailable',
      truncated: false,
    })
    expect('layoutId' in preview).toBe(false)
    expect(preview.cargoLayout).not.toBeNull()
    expect(preview.cargoLayout?.placement).toBeNull()
    expect(harness.hashLookups).toEqual([])
    expect(harness.requests).toEqual([])
  })

  /** D23: baú fechado muda o desenho — a prévia leva `enclosedBody` ao hash e ao pedido do worker. */
  test('baú fechado: o hash e a entrada enfileirada levam enclosedBody', async () => {
    const enclosedContext: TripCargoPreviewContext = { ...MEASURED_CONTEXT, enclosedBody: true }
    const { harness, run } = previewWith({ context: enclosedContext })

    await run()

    expect(harness.hashLookups).toEqual([expectedHash(enclosedContext)])
    expect(harness.hashLookups).not.toEqual([expectedHash(MEASURED_CONTEXT)])
    expect(harness.requests[0]?.enclosedBody).toBe(true)
  })

  test('planta pronta com o mesmo hash: serve a guardada, ready, sem enfileirar', async () => {
    const { harness, run } = previewWith({
      context: MEASURED_CONTEXT,
      stored: storedRow({
        computedAt: '2026-09-12T10:00:00.000Z',
        layout: STORED_LAYOUT,
        status: 'ready',
      }),
    })

    const preview = await run()

    expect(harness.hashLookups).toEqual([expectedHash(MEASURED_CONTEXT)])
    expect(preview.cargoLayout).toEqual(STORED_LAYOUT)
    expect(preview.layoutId).toBe(LAYOUT_ID)
    expect(preview.state).toEqual({
      computedAt: '2026-09-12T10:00:00.000Z',
      errorCode: null,
      stale: false,
      status: 'ready',
      truncated: false,
    })
    expect(harness.requests).toEqual([])
  })

  test('ready cortada pelo orçamento de tempo sai truncated (D13)', async () => {
    const truncatedLayout = {
      ...EMPTY_LAYOUT_LISTS,
      placement: {
        layers: [],
        source: 'measured',
        unplaced: [{ count: 1, label: 'Caixa', reason: 'time_budget' }],
      },
    } as unknown as ResolvedCargoLayout
    const { run } = previewWith({
      context: MEASURED_CONTEXT,
      stored: storedRow({ layout: truncatedLayout, status: 'ready' }),
    })

    expect((await run()).state.truncated).toBe(true)
  })

  /** D20 (T16): o hash ignora a etiqueta — a planta pronta pode ter o cliente de antes. */
  test('cliente renomeado depois do ready: a prévia serve o nome novo', async () => {
    const currentInput = previewInputOf(MEASURED_CONTEXT)
    const drawnBefore = resolveCargoLayout({
      ...currentInput,
      stops: currentInput.stops.map((stop) => ({
        ...stop,
        clientName: 'Cliente Antigo',
        label: 'Endereço antigo',
        noteNumbers: ['9'],
      })),
    })
    const { harness, run } = previewWith({
      context: MEASURED_CONTEXT,
      stored: storedRow({ layout: drawnBefore, status: 'ready' }),
    })

    const preview = await run()

    expect(preview.cargoLayout).toEqual(resolveCargoLayout(currentInput))
    expect(preview.cargoLayout?.rows[0]).toMatchObject({
      clientName: 'Cliente',
      label: 'A',
      noteNumbers: ['10'],
    })
    expect(harness.hashLookups).toHaveLength(1)
    expect(harness.requests).toEqual([])
  })

  test('nada guardado: enfileira com tripId null e o correlationId do request, e responde pending', async () => {
    const { harness, run } = previewWith({ context: MEASURED_CONTEXT })

    const preview = await run()

    expect(harness.requests).toHaveLength(1)
    expect(harness.requests[0]).toMatchObject({
      bedDimensions: MEASURED_CONTEXT.bedDimensions,
      capacityM3: MEASURED_CONTEXT.capacityM3,
      companyId: COMPANY_ID,
      correlationId: CORRELATION_ID,
      tripId: null,
    })
    expect(preview.layoutId).toBe(LAYOUT_ID)
    expect(preview.cargoLayout).toBeNull()
    expect(preview.state).toEqual({
      computedAt: null,
      errorCode: null,
      stale: false,
      status: 'pending',
      truncated: false,
    })
  })

  test('pedido recente em andamento: pending, sem enfileirar de novo', async () => {
    const { harness, run } = previewWith({
      context: MEASURED_CONTEXT,
      stored: storedRow({ status: 'running' }),
    })

    const preview = await run()

    expect(preview.state.status).toBe('pending')
    expect(preview.layoutId).toBe(LAYOUT_ID)
    expect(preview.cargoLayout).toBeNull()
    expect(harness.requests).toEqual([])
  })

  test('pedido parado além do lease: pede de novo (D14/D16)', async () => {
    const { harness, run } = previewWith({
      context: MEASURED_CONTEXT,
      stored: storedRow({ leaseExpired: true, status: 'queued' }),
    })

    await run()

    expect(harness.requests).toHaveLength(1)
  })

  /** D18: dentro da espera, `failed` é a resposta — nada é pedido. */
  test('failed recente: serve o código e não pede', async () => {
    const { harness, run } = previewWith({
      context: MEASURED_CONTEXT,
      stored: storedRow({ errorCode: 'CARGO_LAYOUT_FAILED', status: 'failed' }),
    })

    const preview = await run()

    expect(preview.state).toEqual({
      computedAt: null,
      errorCode: 'CARGO_LAYOUT_FAILED',
      stale: false,
      status: 'failed',
      truncated: false,
    })
    expect(preview.cargoLayout).toBeNull()
    expect(preview.layoutId).toBe(LAYOUT_ID)
    expect(harness.requests).toEqual([])
  })

  /** Reabriu (`enqueued: true`): o estado servido é o do pedido novo — pending, sem código. */
  test('failed além da espera: o upsert reabre e a prévia responde pending', async () => {
    const { harness, run } = previewWith({
      context: MEASURED_CONTEXT,
      stored: storedRow({ errorCode: 'CARGO_LAYOUT_FAILED', leaseExpired: true, status: 'failed' }),
    })

    const preview = await run()

    expect(harness.requests).toHaveLength(1)
    expect(preview.state).toEqual({
      computedAt: null,
      errorCode: null,
      stale: false,
      status: 'pending',
      truncated: false,
    })
    expect(preview.layoutId).toBe(LAYOUT_ID)
  })

  /**
   * O empacotador só é chamado com o baú forçado a `null` — o caminho em que `placeCargo` devolve
   * `null` na primeira linha. Qualquer outra chamada devolveria o event loop ao problema da spec.
   */
  test('o caminho da prévia nunca chama o empacotador com baú', () => {
    const sourceOf = (file: string) =>
      readFileSync(new URL(`../../src/trips/application/${file}`, import.meta.url), 'utf8')
    const useCase = sourceOf('preview-trip-cargo.use-case.ts')
    const service = sourceOf('preview-cargo-layout.service.ts')

    expect(useCase).not.toContain('resolveCargoLayout(')
    expect(service.match(/resolveCargoLayout\([^)]*\)/g)).toEqual([
      'resolveCargoLayout({ ...layoutInput, bedDimensions: null })',
    ])
  })
})

describe('a tela pergunta de novo pelo layoutId (spec 145 T11)', () => {
  /** O polling lê a linha com a entrada guardada, que o upsert mantém com a etiqueta de agora (M3). */
  function polledRow(
    overrides: Partial<StoredCargoLayoutRecordWithInput>,
  ): StoredCargoLayoutRecordWithInput {
    return {
      ...storedRow(overrides),
      input: buildStoredCargoLayoutInput(previewInputOf(MEASURED_CONTEXT)),
      ...overrides,
    }
  }

  function readWith(stored: StoredCargoLayoutRecordWithInput | undefined) {
    const lookups: { readonly companyId: string; readonly layoutId: string }[] = []
    const useCase = createReadCargoLayoutUseCase({
      repository: {
        async findById(query) {
          lookups.push(query)
          return stored
        },
        async findByInputHash() {
          throw new Error('The polling never looks a layout up by hash')
        },
      },
    })
    return { lookups, useCase }
  }

  test('devolve layoutId, state e a planta pronta', async () => {
    const { lookups, useCase } = readWith(
      polledRow({ computedAt: '2026-09-12T10:00:00.000Z', layout: STORED_LAYOUT, status: 'ready' }),
    )

    const result = await useCase.execute({ companyId: COMPANY_ID, layoutId: LAYOUT_ID })

    expect(lookups).toEqual([{ companyId: COMPANY_ID, layoutId: LAYOUT_ID }])
    expect(result).toEqual({
      cargoLayout: STORED_LAYOUT,
      layoutId: LAYOUT_ID,
      shouldRequest: false,
      state: {
        computedAt: '2026-09-12T10:00:00.000Z',
        errorCode: null,
        stale: false,
        status: 'ready',
        truncated: false,
      },
    })
  })

  /** D20 (T16): sem a viagem em memória, a etiqueta de agora é a do `input` da própria linha. */
  test('cliente renomeado depois do ready: o polling serve o nome novo, pelo input guardado', async () => {
    const { useCase } = readWith(
      polledRow({
        input: buildStoredCargoLayoutInput(NEW_INPUT),
        layout: drawnWith(OLD_INPUT),
        status: 'ready',
      }),
    )

    const result = await useCase.execute({ companyId: COMPANY_ID, layoutId: LAYOUT_ID })

    expect(result.cargoLayout).toEqual(drawnWith(NEW_INPUT))
    expect(result.state.status).toBe('ready')
  })

  test('pendente: cargoLayout null e pending', async () => {
    const { useCase } = readWith(polledRow({ status: 'queued' }))

    const result = await useCase.execute({ companyId: COMPANY_ID, layoutId: LAYOUT_ID })

    expect(result.cargoLayout).toBeNull()
    expect(result.state.status).toBe('pending')
    expect(result.shouldRequest).toBe(false)
  })

  /** D16/D18: parada ou falha além da espera — a rota reabre depois da leitura. */
  test('failed além da espera: pede para reabrir', async () => {
    const { useCase } = readWith(
      polledRow({ errorCode: 'CARGO_LAYOUT_FAILED', leaseExpired: true, status: 'failed' }),
    )

    const result = await useCase.execute({ companyId: COMPANY_ID, layoutId: LAYOUT_ID })

    expect(result.state.status).toBe('failed')
    expect(result.shouldRequest).toBe(true)
  })

  test('layout ausente nesta empresa: 404 TRIP_CARGO_LAYOUT_NOT_FOUND', async () => {
    const { useCase } = readWith(undefined)

    const failure = await useCase
      .execute({ companyId: COMPANY_ID, layoutId: LAYOUT_ID })
      .catch((error: unknown) => error)

    expect(failure).toMatchObject({ code: 'TRIP_CARGO_LAYOUT_NOT_FOUND', status: 404 })
  })
})
