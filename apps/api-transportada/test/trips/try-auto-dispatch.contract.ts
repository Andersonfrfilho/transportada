/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Revisão da spec 185 (ADR-0074 §1/§2): o gatilho automático roda depois da escrita que fechou a
 * carga já ter comitado — ele nunca lança. Viagem que reabriu a carga ou terminou entre as duas
 * leituras não tem o que despachar (`undefined`); qualquer outra falha vira
 * `TRIP_AUTO_DISPATCH_FAILED`, com um log sem PII (só empresa, viagem e código do erro).
 */
import { describe, expect, test } from 'bun:test'

import type {
  DispatchTripPort,
  DispatchTripPreconditions,
} from '../../src/trips/application/dispatch-trip.use-case.js'
import { registerTripOccurrence } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { tryAutoDispatchTrip } from '../../src/trips/application/try-auto-dispatch-trip.use-case.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import { TRIP_TRANSITION_BLOCK } from '../../src/trips/domain/trip-state.policy.js'
import {
  TripHasUnloadedDocumentsError,
  TripStateTransitionNotAllowedError,
} from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000002'
const USER_ID = '00000000-0000-4000-8000-000000000003'

const CLOSED_CARGO: DispatchTripPreconditions = {
  hasRoute: true,
  isCargoClosed: true,
  leftBehind: [],
  toLoad: [],
  tripStatus: 'loading',
  unloadedDocumentIds: [],
  unscheduledStopIds: [],
}

type LoggedError = { readonly message: string; readonly metadata: unknown }

function buildTrigger(repository: DispatchTripPort) {
  const logged: LoggedError[] = []
  const run = () =>
    tryAutoDispatchTrip({
      actorUserId: USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      logger: { error: (message, metadata) => logged.push({ message, metadata }) },
      repository,
      tripId: TRIP_ID,
    })
  return { logged, run }
}

/** A primeira leitura é a do gatilho; a segunda, a de `dispatchTrip`. */
function readingInSequence(
  ...states: readonly DispatchTripPreconditions[]
): DispatchTripPort['readPreconditions'] {
  let calls = 0
  return async () => {
    const state = states[Math.min(calls, states.length - 1)] ?? null
    calls += 1
    return state
  }
}

describe('o gatilho automático nunca faz a escrita comitada falhar (spec 185 revisão)', () => {
  test('erro genérico no despacho vira TRIP_AUTO_DISPATCH_FAILED, com log só de ids e código', async () => {
    const { logged, run } = buildTrigger({
      dispatch: async () => {
        throw new Error('connection terminated: row (secret) failed')
      },
      readPreconditions: async () => CLOSED_CARGO,
    })

    const result = await run()

    expect(result).toEqual({ code: 'TRIP_AUTO_DISPATCH_FAILED', outcome: 'blocked' })
    expect(logged).toEqual([
      {
        message: 'trip_auto_dispatch_failed',
        metadata: { companyId: COMPANY_ID, errorCode: 'Error', tripId: TRIP_ID },
      },
    ])
  })

  test('falha na leitura da prontidão também não lança', async () => {
    const { logged, run } = buildTrigger({
      dispatch: async () => ({ tripStatus: 'dispatched' }),
      readPreconditions: async () => {
        throw new TypeError('boom')
      },
    })

    expect(await run()).toEqual({ code: 'TRIP_AUTO_DISPATCH_FAILED', outcome: 'blocked' })
    expect(logged.map((entry) => entry.metadata)).toEqual([
      { companyId: COMPANY_ID, errorCode: 'TypeError', tripId: TRIP_ID },
    ])
  })

  test('erro da API sai no log pelo código, nunca pela mensagem', async () => {
    const { logged, run } = buildTrigger({
      dispatch: async () => {
        throw new TripStateTransitionNotAllowedError(TRIP_TRANSITION_BLOCK.tripAlreadyDispatched)
      },
      readPreconditions: async () => CLOSED_CARGO,
    })

    expect(await run()).toEqual({ code: 'TRIP_AUTO_DISPATCH_FAILED', outcome: 'blocked' })
    expect(logged.map((entry) => entry.metadata)).toEqual([
      { companyId: COMPANY_ID, errorCode: 'STATE_TRANSITION_NOT_ALLOWED', tripId: TRIP_ID },
    ])
  })

  test('carga reaberta entre as leituras: não havia o que despachar, sem log', async () => {
    const { logged, run } = buildTrigger({
      dispatch: async () => ({ tripStatus: 'dispatched' }),
      readPreconditions: readingInSequence(CLOSED_CARGO, {
        ...CLOSED_CARGO,
        isCargoClosed: false,
        toLoad: [{ separationStatus: 'separated', tripDocumentId: 'document-1' }],
        unloadedDocumentIds: ['document-1'],
      }),
    })

    expect(await run()).toBeUndefined()
    expect(logged).toEqual([])
  })

  test('nota voltou a faltar dentro da transação do despacho: undefined, sem log', async () => {
    const { logged, run } = buildTrigger({
      dispatch: async () => {
        throw new TripHasUnloadedDocumentsError(['document-1'])
      },
      readPreconditions: async () => CLOSED_CARGO,
    })

    expect(await run()).toBeUndefined()
    expect(logged).toEqual([])
  })

  for (const tripStatus of ['cancelled', 'completed'] as const) {
    test(`viagem ${tripStatus} entre as leituras: undefined, sem log`, async () => {
      const { logged, run } = buildTrigger({
        dispatch: async () => ({ tripStatus: 'dispatched' }),
        readPreconditions: readingInSequence(CLOSED_CARGO, { ...CLOSED_CARGO, tripStatus }),
      })

      expect(await run()).toBeUndefined()
      expect(logged).toEqual([])
    })
  }

  test('os dois gates de ADR-0074 §2 continuam virando blocked com o próprio código', async () => {
    const noRoute = buildTrigger({
      dispatch: async () => ({ tripStatus: 'dispatched' }),
      readPreconditions: readingInSequence(CLOSED_CARGO, { ...CLOSED_CARGO, hasRoute: false }),
    })
    const unscheduled = buildTrigger({
      dispatch: async () => ({ tripStatus: 'dispatched' }),
      readPreconditions: async () => ({ ...CLOSED_CARGO, unscheduledStopIds: ['stop-1'] }),
    })

    expect(await noRoute.run()).toEqual({ code: 'TRIP_HAS_NO_ROUTE', outcome: 'blocked' })
    expect(await unscheduled.run()).toEqual({
      code: 'TRIP_HAS_UNSCHEDULED_STOPS',
      details: { stopIds: ['stop-1'] },
      outcome: 'blocked',
    })
    expect([...noRoute.logged, ...unscheduled.logged]).toEqual([])
  })
})

/**
 * Revisão da spec 185 (RF2, ADR-0074 §4): a ocorrência só tenta o despacho quando **ela** tira a
 * nota da conta — tipo "a viagem segue sem a nota", sobre a nota inteira, e a nota ainda não
 * carregada (é o que a põe em `leftBehind`). Ocorrência parcial, de tipo que só anota, ou sobre
 * nota já carregada numa viagem que ficou toda carregada em `loading` não despacha nada.
 */
describe('a ocorrência só despacha quando deixa a nota para trás (spec 185 revisão)', () => {
  const DOCUMENT_ID = '00000000-0000-4000-8000-000000000017'
  const TYPE_ID = '00000000-0000-4000-8000-0000000000e1'

  async function registerWith(input: {
    readonly leavesDocumentBehind: boolean
    readonly productCode: string
    readonly state: DispatchTripPreconditions
  }) {
    const calls = { dispatch: 0, readPreconditions: 0 }
    const registered = await registerTripOccurrence({
      actorUserId: USER_ID,
      attachment: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' },
      autoDispatch: {
        channel: TRIP_FIELD_CHANNELS.backoffice,
        logger: { error: () => {} },
        repository: {
          dispatch: async () => {
            calls.dispatch += 1
            return { tripStatus: 'dispatched' }
          },
          readPreconditions: async () => {
            calls.readPreconditions += 1
            return input.state
          },
        },
      },
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      note: '',
      occurredOn: '24/09/2026',
      occurrenceTypeId: TYPE_ID,
      productCode: input.productCode,
      repository: {
        findOccurrenceType: async () => ({
          active: true,
          allowsMultipleItems: true,
          emailBody: '',
          emailSubject: '',
          emailTemplateKey: null,
          id: TYPE_ID,
          leavesDocumentBehind: input.leavesDocumentBehind,
          name: 'Item faltante',
          notifies: false,
          stage: 'separation',
        }),
        listDocumentProducts: async () => [{ code: 'SKU-1', description: 'Caixa' }],
        listOccurrences: async () => [],
        readTemplateValues: async () => {
          throw new Error('não deveria montar e-mail')
        },
        saveOccurrence: async (query) => ({
          createdAt: '2026-09-24T12:00:00.000Z',
          id: 'occurrence-1',
          note: query.note,
          occurrenceTypeId: query.occurrenceTypeId,
          productCode: query.productCode,
          stage: query.stage,
          typeName: query.typeName,
        }),
      },
      tripId: TRIP_ID,
    })
    return { calls, registered }
  }

  test('ocorrência parcial numa viagem toda carregada em loading: não despacha', async () => {
    const { calls, registered } = await registerWith({
      leavesDocumentBehind: true,
      productCode: 'SKU-1',
      state: CLOSED_CARGO,
    })

    expect(registered.autoDispatch).toBeUndefined()
    expect(calls).toEqual({ dispatch: 0, readPreconditions: 0 })
  })

  test('tipo que só anota, sobre a nota inteira: não despacha', async () => {
    const { calls, registered } = await registerWith({
      leavesDocumentBehind: false,
      productCode: '',
      state: CLOSED_CARGO,
    })

    expect(registered.autoDispatch).toBeUndefined()
    expect(calls).toEqual({ dispatch: 0, readPreconditions: 0 })
  })

  test('nota inteira já carregada (fora de leftBehind) numa viagem toda carregada: não despacha', async () => {
    const { calls, registered } = await registerWith({
      leavesDocumentBehind: true,
      productCode: '',
      state: CLOSED_CARGO,
    })

    expect(registered.autoDispatch).toBeUndefined()
    expect(calls.dispatch).toBe(0)
  })

  test('nota inteira não carregada que entra em leftBehind e fecha a carga: despacha', async () => {
    const { calls, registered } = await registerWith({
      leavesDocumentBehind: true,
      productCode: '',
      state: {
        ...CLOSED_CARGO,
        leftBehind: [{ occurrenceTypeName: 'Item faltante', tripDocumentId: DOCUMENT_ID }],
      },
    })

    expect(registered.autoDispatch).toEqual({ outcome: 'dispatched' })
    expect(calls.dispatch).toBe(1)
  })
})
