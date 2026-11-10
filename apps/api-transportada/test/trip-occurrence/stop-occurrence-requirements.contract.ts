/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 315 (D3–D7, D10): o tipo da ocorrência de **parada** cobra localização, foto, observação, horário de
 * chegada e espera mínima depois do "Cheguei" — e o horário informado grava a chegada da parada.
 */
import { describe, expect, test } from 'bun:test'

import { reportStopOccurrence } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import type { ReportStopOccurrenceInput } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import { assertMinWaitExcludesArrivalTime } from '../../src/trips/domain/occurrence-min-wait-shape.policy.js'
import {
  assertStopOccurrenceRequirements,
  type StopOccurrenceTypeRequirements,
} from '../../src/trips/domain/stop-occurrence-requirements.policy.js'
import { parseStopOccurrenceRequest } from '../../src/trips/presentation/me-trip.schema.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'
const STOP_ID = '00000000-0000-4000-8000-000000000005'
const TYPE_ID = '00000000-0000-4000-8000-0000000000d1'

const NOW = new Date('2026-11-10T15:00:00.000Z')
const DISPATCHED_AT = new Date('2026-11-10T08:00:00.000Z')
const POINT = {
  accuracyMeters: '12.00',
  capturedAt: '2026-11-10T15:00:00.000Z',
  latitude: '-21.1775000',
  longitude: '-47.8103000',
}

const OFF: StopOccurrenceTypeRequirements = {
  arrivalTimeMode: 'off',
  attachmentMode: 'off',
  locationMode: 'off',
  minWaitAfterArrivalMinutes: null,
  noteMode: 'off',
  photoMinimumCount: 1,
}

function buildWorld(params: {
  readonly arrivedAt?: Date | null
  readonly requirements: Partial<StopOccurrenceTypeRequirements>
}) {
  const state = createFieldReportState()
  state.dispatchedAtByTripId.set(TRIP_ID, DISPATCHED_AT)
  state.stops.set(STOP_ID, {
    arrivedAt: params.arrivedAt ?? null,
    estimatedArrivalAt: null,
    tripId: TRIP_ID,
    tripStatus: 'in_transit',
  })
  state.stopOccurrenceTypes.set(`${COMPANY_ID}:${TYPE_ID}`, {
    requirements: { ...OFF, ...params.requirements },
    stopKind: 'dock_closed',
  })
  return { state, world: createFieldReportUnitOfWork(state) }
}

function input(
  world: ReturnType<typeof buildWorld>['world'],
  overrides: Partial<ReportStopOccurrenceInput> = {},
): ReportStopOccurrenceInput {
  return {
    actorUserId: ACTOR_USER_ID,
    attachmentObjectId: null,
    companyId: COMPANY_ID,
    description: '',
    distanceMeters: null,
    documentId: null,
    driverId: DRIVER_ID,
    idempotencyKey: `key-${Math.random()}`,
    location: null,
    now: NOW,
    occurrenceTypeId: TYPE_ID,
    stopId: STOP_ID,
    unitOfWork: world,
    ...overrides,
  } as ReportStopOccurrenceInput
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    return (error as { readonly code?: string }).code ?? 'NO_CODE'
  }
  return 'OK'
}

describe('o corpo da ocorrência de parada aceita a hora de chegada (spec 315 D4)', () => {
  const request = (body: unknown) =>
    new Request('http://localhost/x', {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

  test('arrivedAt e confirmOutOfOrder entram no corpo', async () => {
    const parsed = await parseStopOccurrenceRequest(
      request({
        arrivedAt: '2026-11-10T14:20:00.000Z',
        confirmOutOfOrder: true,
        occurrenceTypeId: TYPE_ID,
      }),
    )

    expect(parsed.arrivedAt?.toISOString()).toBe('2026-11-10T14:20:00.000Z')
    expect(parsed.confirmOutOfOrder).toBe(true)
  })

  test('hora que não é ISO é 400 e campo extra continua recusado', async () => {
    await expect(
      parseStopOccurrenceRequest(request({ arrivedAt: '14:20', occurrenceTypeId: TYPE_ID })),
    ).rejects.toThrow()
    await expect(
      parseStopOccurrenceRequest(request({ foo: 1, occurrenceTypeId: TYPE_ID })),
    ).rejects.toThrow()
  })
})

describe('a localização, a foto e a observação da parada (spec 315 D3, D7)', () => {
  test('tipo sem exigência registra como antes', async () => {
    const { world } = buildWorld({ requirements: {} })
    const result = await reportStopOccurrence(input(world))

    expect(result.arrivalRecorded).toBe(false)
  })

  test('localização obrigatória recusa o registro sem ponto — e aceita com ponto', async () => {
    const { world } = buildWorld({ requirements: { locationMode: 'required' } })

    expect(await codeOf(reportStopOccurrence(input(world)))).toBe(
      'TRIP_OCCURRENCE_LOCATION_REQUIRED',
    )
    expect(await codeOf(reportStopOccurrence(input(world, { location: POINT })))).toBe('OK')
  })

  test('foto obrigatória recusa o registro sem anexo', async () => {
    const { world } = buildWorld({ requirements: { attachmentMode: 'required' } })

    expect(await codeOf(reportStopOccurrence(input(world)))).toBe(
      'TRIP_OCCURRENCE_ATTACHMENT_REQUIRED',
    )
  })

  test('observação obrigatória recusa o texto vazio e aceita o preenchido', async () => {
    const { world } = buildWorld({ requirements: { noteMode: 'required' } })

    expect(await codeOf(reportStopOccurrence(input(world, { description: '  ' })))).toBe(
      'TRIP_OCCURRENCE_NOTE_REQUIRED',
    )
    expect(
      await codeOf(reportStopOccurrence(input(world, { description: 'Portão fechado' }))),
    ).toBe('OK')
  })

  test('o corpo antigo, só com kind, não tem o que cobrar', async () => {
    const { world } = buildWorld({ requirements: { locationMode: 'required' } })
    const rest: Record<string, unknown> = { ...input(world) }
    delete rest.occurrenceTypeId

    expect(
      await codeOf(
        reportStopOccurrence({ ...rest, kind: 'long_wait' } as ReportStopOccurrenceInput),
      ),
    ).toBe('OK')
  })
})

describe('o horário de chegada informado grava a chegada (spec 315 D4, D5)', () => {
  const INFORMED = new Date('2026-11-10T14:20:00.000Z')

  test('obrigatório e ausente: recusa; informado: grava a chegada e a ocorrência', async () => {
    const { state, world } = buildWorld({ requirements: { arrivalTimeMode: 'required' } })

    expect(await codeOf(reportStopOccurrence(input(world)))).toBe(
      'TRIP_OCCURRENCE_ARRIVAL_TIME_REQUIRED',
    )
    const result = await reportStopOccurrence(input(world, { arrivedAt: INFORMED }))

    expect(result.arrivalRecorded).toBe(true)
    expect(state.calls).toContain('recordOccurrence:dock_closed')
    expect(state.arrivedAtByTripId.get(TRIP_ID)).toEqual(INFORMED)
  })

  test('parada já chegada: o horário é descartado, sem erro, e não exige o campo', async () => {
    const { state, world } = buildWorld({
      arrivedAt: new Date('2026-11-10T13:00:00.000Z'),
      requirements: { arrivalTimeMode: 'required' },
    })

    const withoutTime = await reportStopOccurrence(input(world))
    const withTime = await reportStopOccurrence(input(world, { arrivedAt: INFORMED }))

    expect(withoutTime.arrivalRecorded).toBe(false)
    expect(withTime.arrivalRecorded).toBe(false)
    expect(state.arrivedAtByTripId.has(TRIP_ID)).toBe(false)
  })

  test('opcional: sem horário não grava chegada; com horário grava', async () => {
    const { world } = buildWorld({ requirements: { arrivalTimeMode: 'optional' } })

    expect((await reportStopOccurrence(input(world))).arrivalRecorded).toBe(false)
    expect(
      (await reportStopOccurrence(input(world, { arrivedAt: INFORMED }))).arrivalRecorded,
    ).toBe(true)
  })

  test('desligado: o horário enviado é ignorado', async () => {
    const { world } = buildWorld({ requirements: {} })

    expect(
      (await reportStopOccurrence(input(world, { arrivedAt: INFORMED }))).arrivalRecorded,
    ).toBe(false)
  })

  test('horário no futuro ou antes do despacho é recusado e nada é gravado', async () => {
    const { state, world } = buildWorld({ requirements: { arrivalTimeMode: 'required' } })

    expect(
      await codeOf(
        reportStopOccurrence(input(world, { arrivedAt: new Date('2026-11-10T16:00:00.000Z') })),
      ),
    ).toBe('ARRIVED_AT_IN_FUTURE')
    expect(
      await codeOf(
        reportStopOccurrence(input(world, { arrivedAt: new Date('2026-11-10T07:00:00.000Z') })),
      ),
    ).toBe('ARRIVED_AT_BEFORE_DISPATCH')
    expect(state.calls).not.toContain('recordOccurrence:dock_closed')
  })
})

describe('a espera mínima depois do "Cheguei" (spec 315 D10)', () => {
  const WAIT = { minWaitAfterArrivalMinutes: 30 }

  test('sem "Cheguei" o tipo está bloqueado, mesmo informando horário', async () => {
    const { world } = buildWorld({ requirements: WAIT })

    expect(
      await codeOf(
        reportStopOccurrence(input(world, { arrivedAt: new Date('2026-11-10T13:00:00.000Z') })),
      ),
    ).toBe('TRIP_OCCURRENCE_MIN_WAIT_NOT_REACHED')
  })

  test('12 minutos depois do "Cheguei" ainda bloqueia e diz quando abre', async () => {
    const arrivedAt = new Date('2026-11-10T14:48:00.000Z')
    const { world } = buildWorld({ arrivedAt, requirements: WAIT })

    const error = await reportStopOccurrence(input(world)).catch((caught: unknown) => caught)

    expect((error as { code: string }).code).toBe('TRIP_OCCURRENCE_MIN_WAIT_NOT_REACHED')
    expect((error as { extraBody: { availableAt: string } }).extraBody.availableAt).toBe(
      '2026-11-10T15:18:00.000Z',
    )
  })

  test('30 minutos depois do "Cheguei" abre', async () => {
    const { world } = buildWorld({
      arrivedAt: new Date('2026-11-10T14:30:00.000Z'),
      requirements: WAIT,
    })

    expect(await codeOf(reportStopOccurrence(input(world)))).toBe('OK')
  })
})

describe('o escritório e a decisão da chegada (spec 315 D10)', () => {
  const INFORMED = new Date('2026-11-10T14:20:00.000Z')
  const base = {
    arrivedAt: null,
    attachmentCount: 0,
    hasLocation: false,
    informedArrivalAt: null,
    isOffice: true,
    note: '',
    now: NOW,
  } as const

  test('espera mínima: o escritório não tem a trava, mas informa a hora da chegada quando não há "Cheguei"', () => {
    const requirements = { ...OFF, minWaitAfterArrivalMinutes: 30 }

    expect(() => assertStopOccurrenceRequirements({ ...base, requirements })).toThrow(
      'requires the arrival time',
    )
    expect(
      assertStopOccurrenceRequirements({ ...base, informedArrivalAt: INFORMED, requirements }),
    ).toEqual({ arrivalAt: INFORMED, kind: 'record' })
    expect(
      assertStopOccurrenceRequirements({
        ...base,
        arrivedAt: new Date('2026-11-10T13:00:00.000Z'),
        requirements,
      }),
    ).toEqual({ kind: 'none' })
  })

  test('o escritório não precisa de localização nem de foto', () => {
    const requirements = {
      ...OFF,
      attachmentMode: 'required',
      locationMode: 'required',
      noteMode: 'required',
    } as const

    expect(assertStopOccurrenceRequirements({ ...base, requirements })).toEqual({ kind: 'none' })
  })
})

describe('a espera mínima exclui o horário de chegada digitado (spec 315 D10)', () => {
  test('o estado resultante decide: o gravado vale para o campo ausente', () => {
    const stored = { arrivalTimeMode: 'required', minWaitAfterArrivalMinutes: null } as const

    expect(() =>
      assertMinWaitExcludesArrivalTime({ stored, values: { minWaitAfterArrivalMinutes: 30 } }),
    ).toThrow('cannot ask for the arrival time')
    expect(() =>
      assertMinWaitExcludesArrivalTime({
        stored,
        values: { arrivalTimeMode: 'off', minWaitAfterArrivalMinutes: 30 },
      }),
    ).not.toThrow()
    expect(() =>
      assertMinWaitExcludesArrivalTime({
        stored: { arrivalTimeMode: 'off', minWaitAfterArrivalMinutes: 30 },
        values: { arrivalTimeMode: 'optional' },
      }),
    ).toThrow('cannot ask for the arrival time')
    expect(() =>
      assertMinWaitExcludesArrivalTime({
        stored: { arrivalTimeMode: 'off', minWaitAfterArrivalMinutes: 30 },
        values: { arrivalTimeMode: 'required', minWaitAfterArrivalMinutes: null },
      }),
    ).not.toThrow()
  })
})
