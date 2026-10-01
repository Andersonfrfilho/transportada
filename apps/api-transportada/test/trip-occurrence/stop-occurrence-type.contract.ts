/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 D2: a ocorrência de parada passa a ser escolhida pelo **tipo do catálogo**
 * (`occurrenceTypeId`), e o "qual dos 5" que o backend ainda precisa — a sugestão de cobrança da 060
 * e o template do aviso — sai da coluna `stop_kind` do tipo, nunca do nome (que o operador renomeia).
 * O corpo antigo, com `kind`, continua aceito: a fila do aparelho guarda itens de antes da troca.
 */
import { describe, expect, test } from 'bun:test'

import { listFieldOccurrenceTypes } from '../../src/trips/application/list-field-occurrence-types.use-case.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { reportStopOccurrence } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import { ApiError } from '../../src/shared/api.error.js'
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
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000006'
const CHARGE_TYPE_ID = '00000000-0000-4000-8000-0000000000c1'
const OPERATOR_STOP_TYPE_ID = '00000000-0000-4000-8000-0000000000c2'
const UNKNOWN_TYPE_ID = '00000000-0000-4000-8000-0000000000c3'

function request(body: unknown): Request {
  return new Request('http://localhost/me/trips/current/stops/x/occurrences', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

function buildWorld() {
  const state = createFieldReportState()
  state.stops.set(STOP_ID, {
    arrivedAt: null,
    estimatedArrivalAt: null,
    tripId: TRIP_ID,
    tripStatus: 'in_transit',
  })
  state.documents.set(DOCUMENT_ID, {
    separationStatus: 'loaded',
    stopId: STOP_ID,
    tripId: TRIP_ID,
    tripStatus: 'in_transit',
  })
  /** Só o que a consulta real devolve: tipo desta empresa, `flow: stop` e ativo. */
  state.stopOccurrenceTypes.set(`${COMPANY_ID}:${CHARGE_TYPE_ID}`, {
    stopKind: 'unexpected_charge',
  })
  state.stopOccurrenceTypes.set(`${COMPANY_ID}:${OPERATOR_STOP_TYPE_ID}`, { stopKind: null })
  return createFieldReportUnitOfWork(state)
}

function baseInput(world: ReturnType<typeof buildWorld>, key: string) {
  return {
    actorUserId: ACTOR_USER_ID,
    attachmentObjectId: null,
    companyId: COMPANY_ID,
    description: 'Cobraram taxa de descarga',
    distanceMeters: null,
    documentId: DOCUMENT_ID,
    driverId: DRIVER_ID,
    idempotencyKey: key,
    stopId: STOP_ID,
    unitOfWork: world,
  }
}

describe('o corpo da ocorrência de parada aceita o tipo do catálogo (spec 218 D2)', () => {
  test('occurrenceTypeId entra no lugar de kind', async () => {
    const parsed = await parseStopOccurrenceRequest(request({ occurrenceTypeId: CHARGE_TYPE_ID }))

    expect(parsed.occurrenceTypeId).toBe(CHARGE_TYPE_ID)
    expect(parsed.kind).toBeUndefined()
  })

  test('o corpo antigo, com kind, continua valendo — a fila guarda itens de antes da troca', async () => {
    const parsed = await parseStopOccurrenceRequest(request({ kind: 'long_wait' }))

    expect(parsed.kind).toBe('long_wait')
    expect(parsed.occurrenceTypeId).toBeUndefined()
  })

  test('os dois juntos, ou nenhum dos dois, é 400', async () => {
    for (const body of [{ kind: 'long_wait', occurrenceTypeId: CHARGE_TYPE_ID }, {}]) {
      const rejected = await parseStopOccurrenceRequest(request(body)).catch(
        (error: unknown) => error,
      )
      expect((rejected as { status?: number }).status).toBe(400)
    }
  })
})

describe('o "qual dos 5" sai do stop_kind do tipo, nunca do nome (spec 218 D2)', () => {
  test('grava o tipo e o kind dele, e a cobrança e o aviso leem esse kind', async () => {
    const world = buildWorld()
    const suggested: string[] = []
    const notified: string[] = []

    await reportStopOccurrence({
      ...baseInput(world, 'chave-1'),
      notifier: {
        async notify(input) {
          notified.push(input.kind)
        },
      },
      occurrenceTypeId: CHARGE_TYPE_ID,
      suggestCharges: {
        async onDelivered(input) {
          suggested.push(input.tripDocumentId)
        },
      },
    })

    expect(world.state.calls).toContain('recordOccurrence:unexpected_charge')
    expect(world.state.recordedOccurrenceTypeIds).toEqual([CHARGE_TYPE_ID])
    expect(suggested).toEqual([DOCUMENT_ID])
    expect(notified).toEqual(['unexpected_charge'])
  })

  test('tipo de parada criado pelo operador, sem stop_kind, vale como "other"', async () => {
    const world = buildWorld()
    const suggested: string[] = []

    await reportStopOccurrence({
      ...baseInput(world, 'chave-2'),
      occurrenceTypeId: OPERATOR_STOP_TYPE_ID,
      suggestCharges: {
        async onDelivered(input) {
          suggested.push(input.tripDocumentId)
        },
      },
    })

    expect(world.state.calls).toContain('recordOccurrence:other')
    expect(suggested).toEqual([])
  })

  test('tipo que não é de parada ativo desta empresa é recusado, e nada é gravado', async () => {
    const world = buildWorld()

    const rejected = await reportStopOccurrence({
      ...baseInput(world, 'chave-3'),
      occurrenceTypeId: UNKNOWN_TYPE_ID,
    }).catch((error: unknown) => error)

    expect(rejected).toBeInstanceOf(ApiError)
    expect((rejected as ApiError).code).toBe('OCCURRENCE_TYPE_NOT_STOP')
    expect(world.state.calls.some((call) => call.startsWith('recordOccurrence'))).toBe(false)
  })

  test('o kind do corpo antigo grava sem tipo, como sempre gravou', async () => {
    const world = buildWorld()

    await reportStopOccurrence({ ...baseInput(world, 'chave-4'), kind: 'long_wait' })

    expect(world.state.calls).toContain('recordOccurrence:long_wait')
    expect(world.state.recordedOccurrenceTypeIds).toEqual([null])
  })
})

describe('o catálogo do motorista leva o stop_kind (spec 218 D2)', () => {
  function record(overrides: Partial<OccurrenceTypeRecord>): OccurrenceTypeRecord {
    return {
      active: true,
      allowsMultipleItems: true,
      attachmentMode: 'optional',
      emailBody: '',
      emailSubject: '',
      emailTemplateKey: null,
      id: CHARGE_TYPE_ID,
      name: 'Cobrança inesperada',
      notifies: false,
      stage: 'delivery',
      ...overrides,
    }
  }

  test('tipo de parada sai com o stop_kind; tipo de nota, com null', async () => {
    const types = await listFieldOccurrenceTypes({
      companyId: COMPANY_ID,
      repository: {
        async listOccurrenceTypes() {
          return [
            record({ flow: 'stop', stopKind: 'unexpected_charge' }),
            record({ flow: 'document', id: UNKNOWN_TYPE_ID, name: 'Cliente ausente' }),
          ]
        },
      },
    })

    expect(types.map((type) => [type.flow, type.stopKind])).toEqual([
      ['stop', 'unexpected_charge'],
      ['document', null],
    ])
  })
})
