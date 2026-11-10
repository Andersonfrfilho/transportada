/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T2 (D4, D4c, D6): a marca do tipo com coleta de canhoto e as regras puras da coleta.
 *
 * - `createsCanhotoPickup` é a marca "tipo com coleta" que a T1 não tinha: o cadastro a grava e a lê para decidir
 *   `countsCargoOnPickupTrip` — no tipo com coleta só `false` vale na fase 1 (`true` explícito é 422, ausente vira
 *   `false`); no tipo sem coleta o valor passa como veio.
 * - A trava de repetido trata o tipo com coleta como `until_resolved` e a coleta aberta (`pending | scheduled`) como a
 *   ocorrência aberta (D6).
 * - A tabela não toca `trip_documents` e o CHECK de entregue segue no schema (CA03).
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  companyOccurrenceTypes,
  tripCanhotoPickups,
  tripDocuments,
} from '../../src/database/trip.schema.js'
import {
  CANHOTO_PICKUP_OPEN_STATUSES,
  CANHOTO_PICKUP_STATUSES,
} from '../../src/shared/canhoto-pickup.constant.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { toSaveOccurrenceTypeValues } from '../../src/trips/application/save-occurrence-type-values.mapper.js'
import {
  saveOccurrenceTypeWithTemplate,
  type CurrentOccurrenceTypeShape,
  type SaveOccurrenceTypeValues,
} from '../../src/trips/application/save-occurrence-type.use-case.js'
import {
  effectiveDuplicateRequestPolicy,
  isCanhotoPickupOpen,
  occurrenceTypeCreatesCanhotoPickup,
  resolvePickupCargoCounting,
} from '../../src/trips/domain/canhoto-pickup.policy.js'
import { OccurrenceTypePickupCargoUnsupportedError } from '../../src/trips/domain/trip.error.js'
import { parseOccurrenceTypeRequest } from '../../src/trips/presentation/occurrence.schema.js'

const COMPANY = '00000000-0000-4000-8000-000000321101'
const TYPE_ID = '00000000-0000-4000-8000-000000321102'

const BASE_VALUES: SaveOccurrenceTypeValues = {
  active: true,
  emailTemplateKey: null,
  name: 'Canhoto retido pelo cliente',
  notifies: false,
  occurrenceTypeId: null,
  stage: 'delivery',
}

const STORED_SHAPE: CurrentOccurrenceTypeShape = {
  itemsMode: 'off',
  redeliveryPolicy: 'unset',
  stage: 'delivery',
}

function run(params: {
  readonly stored: CurrentOccurrenceTypeShape | null
  readonly values: Partial<SaveOccurrenceTypeValues>
}) {
  const saved: SaveOccurrenceTypeValues[] = []
  const reads: string[] = []
  const promise = saveOccurrenceTypeWithTemplate({
    companyId: COMPANY,
    findCurrentType: async ({ occurrenceTypeId }) => {
      reads.push(occurrenceTypeId)
      return params.stored
    },
    save: async (values) => {
      saved.push(values)
      return { ...BASE_VALUES, id: TYPE_ID } as unknown as OccurrenceTypeRecord
    },
    templates: {
      findContractorTemplate: async () => null,
      hasActiveEmailTemplate: async () => true,
    },
    values: { ...BASE_VALUES, ...params.values },
  })
  return { promise, reads, saved }
}

function putRequest(extra: Record<string, unknown>): Request {
  return new Request('http://localhost/company-settings/occurrence-types', {
    body: JSON.stringify({
      active: true,
      emailTemplateKey: null,
      flow: 'document',
      name: 'Canhoto retido pelo cliente',
      notifies: false,
      occurrenceTypeId: null,
      stage: 'delivery',
      ...extra,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

describe('a marca do tipo com coleta (spec 321 T2)', () => {
  test.each([
    [{ createsCanhotoPickup: true }, true],
    [{ createsCanhotoPickup: false }, false],
    [{}, false],
  ] as const)('%j → cria coleta: %p', (type, expected) => {
    expect(occurrenceTypeCreatesCanhotoPickup(type)).toBe(expected)
  })

  test('a coluna nasce `false`: nenhum tipo existente passa a criar coleta', () => {
    const column = getTableConfig(companyOccurrenceTypes).columns.find(
      (candidate) => candidate.name === 'creates_canhoto_pickup',
    )
    expect(column?.notNull).toBe(true)
    expect(column?.default).toBe(false)
  })

  test('a fronteira aceita a marca; ausente é "não mexa"; não booleano é 400', async () => {
    const parsed = await parseOccurrenceTypeRequest(putRequest({ createsCanhotoPickup: true }))
    expect(parsed.createsCanhotoPickup).toBe(true)
    const untouched = await parseOccurrenceTypeRequest(putRequest({}))
    expect(untouched.createsCanhotoPickup).toBeUndefined()
    await expect(
      parseOccurrenceTypeRequest(putRequest({ createsCanhotoPickup: 'sim' })),
    ).rejects.toMatchObject({ status: 400 })
  })

  test('o mapeamento da composição repassa a marca', () => {
    expect(
      toSaveOccurrenceTypeValues({ ...BASE_VALUES, createsCanhotoPickup: true })
        .createsCanhotoPickup,
    ).toBe(true)
  })
})

describe('o tipo com coleta não soma carga na fase 1 (spec 321 D4c)', () => {
  test.each([
    // [gravado: coleta, conta carga] [pedido: coleta, conta carga] → decisão
    [undefined, undefined, true, undefined, { countsCargoOnPickupTrip: false, kind: 'write' }],
    [undefined, undefined, true, true, { kind: 'refuse' }],
    [undefined, undefined, true, false, { countsCargoOnPickupTrip: false, kind: 'write' }],
    [true, false, undefined, undefined, { countsCargoOnPickupTrip: undefined, kind: 'write' }],
    [true, false, undefined, true, { kind: 'refuse' }],
    [true, true, undefined, undefined, { countsCargoOnPickupTrip: false, kind: 'write' }],
    [false, true, true, undefined, { countsCargoOnPickupTrip: false, kind: 'write' }],
    [true, false, false, true, { countsCargoOnPickupTrip: true, kind: 'write' }],
    [false, false, undefined, true, { countsCargoOnPickupTrip: true, kind: 'write' }],
    [
      undefined,
      undefined,
      undefined,
      undefined,
      { countsCargoOnPickupTrip: undefined, kind: 'write' },
    ],
  ] as const)(
    'gravado coleta=%p carga=%p, pedido coleta=%p carga=%p',
    (
      storedCreatesPickup,
      storedCountsCargo,
      requestedCreatesPickup,
      requestedCountsCargo,
      expected,
    ) => {
      expect(
        resolvePickupCargoCounting({
          requestedCountsCargo,
          requestedCreatesPickup,
          storedCountsCargo,
          storedCreatesPickup,
        }),
      ).toEqual(expected)
    },
  )

  test('criar o tipo com coleta sem dizer a carga grava `false` (a coluna nasce `true`)', async () => {
    const { promise, saved } = run({ stored: null, values: { createsCanhotoPickup: true } })
    await promise
    expect(saved[0]?.createsCanhotoPickup).toBe(true)
    expect(saved[0]?.countsCargoOnPickupTrip).toBe(false)
  })

  test('pedir `true` no tipo com coleta é 422, sem gravar', async () => {
    const { promise, saved } = run({
      stored: { ...STORED_SHAPE, countsCargoOnPickupTrip: false, createsCanhotoPickup: true },
      values: { countsCargoOnPickupTrip: true, occurrenceTypeId: TYPE_ID },
    })
    await expect(promise).rejects.toBeInstanceOf(OccurrenceTypePickupCargoUnsupportedError)
    expect(saved).toEqual([])
    const error = new OccurrenceTypePickupCargoUnsupportedError()
    expect(error.code).toBe('OCCURRENCE_TYPE_PICKUP_CARGO_UNSUPPORTED')
    expect(error.status).toBe(422)
  })

  test('ligar a coleta num tipo gravado com carga `true` lê o gravado e grava `false`', async () => {
    const { promise, reads, saved } = run({
      stored: { ...STORED_SHAPE, countsCargoOnPickupTrip: true, createsCanhotoPickup: false },
      values: { createsCanhotoPickup: true, occurrenceTypeId: TYPE_ID },
    })
    await promise
    expect(reads).toEqual([TYPE_ID])
    expect(saved[0]?.countsCargoOnPickupTrip).toBe(false)
  })

  test('o painel manda o tipo com coleta inteiro (`true`/`false`) e grava normalmente', async () => {
    const { promise, saved } = run({
      stored: { ...STORED_SHAPE, countsCargoOnPickupTrip: false, createsCanhotoPickup: true },
      values: {
        countsCargoOnPickupTrip: false,
        createsCanhotoPickup: true,
        occurrenceTypeId: TYPE_ID,
      },
    })
    await promise
    expect(saved[0]?.countsCargoOnPickupTrip).toBe(false)
  })
})

describe('a coleta aberta e a trava de repetido (spec 321 D6)', () => {
  test('aberta é `pending | scheduled`, exatamente', () => {
    expect([...CANHOTO_PICKUP_OPEN_STATUSES]).toEqual(['pending', 'scheduled'])
    expect(CANHOTO_PICKUP_STATUSES.filter(isCanhotoPickupOpen)).toEqual(['pending', 'scheduled'])
  })

  test.each(['allow', 'while_request_open', 'until_resolved'] as const)(
    'tipo com coleta e política %p vale `until_resolved`; sem coleta, a própria',
    (policy) => {
      expect(effectiveDuplicateRequestPolicy({ createsCanhotoPickup: true, policy })).toBe(
        'until_resolved',
      )
      expect(effectiveDuplicateRequestPolicy({ createsCanhotoPickup: false, policy })).toBe(policy)
    },
  )
})

describe('a coleta não é vínculo de viagem (spec 321 D3, CA03)', () => {
  test('a trava de entregue de `trip_documents` segue no schema', () => {
    const checks = getTableConfig(tripDocuments).checks.map((check) => check.name)
    expect(checks).toContain('trip_documents_delivered_locks_release_check')
  })

  test('a coleta guarda a origem e a viagem nova à parte, com uma aberta por vínculo de origem', () => {
    const config = getTableConfig(tripCanhotoPickups)
    expect(config.name).toBe('trip_canhoto_pickups')
    expect(config.columns.map((column) => column.name).sort()).toEqual(
      [
        'collected_at',
        'company_id',
        'created_at',
        'id',
        'nfe_document_id',
        'occurrence_id',
        'origin_trip_document_id',
        'pickup_stop_id',
        'pickup_trip_id',
        'status',
        'updated_at',
      ].sort(),
    )
    expect(config.indexes.map((index) => index.config.name)).toContain(
      'trip_canhoto_pickups_open_origin_unique',
    )
  })
})
