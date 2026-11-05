/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T11 — a camada comum dos eventos da entrega pelo WhatsApp (saí, cheguei, entreguei,
 * devolvi, ocorrência): resultado tipado sobre as funções do app, as falas para o motorista e para o
 * grupo, e a escolha da parada do saí/cheguei. Contrato com fakes das portas: nenhum banco.
 */
import { describe, expect, test } from 'bun:test'

import { OccurrenceTypeNotAvailableForContractorError } from '../../src/trips/domain/occurrence-type-contractor-scope.error.js'
import {
  OccurrenceItemQuantityAboveDocumentError,
  TripDocumentNotReachableError,
  TripHasStopEnRouteError,
  TripOccurrenceAttachmentRequiredError,
  TripOccurrenceDeclaredAmountRequiredError,
  TripOccurrenceItemsMinimumNotMetError,
  TripOccurrenceItemsRequiredError,
  TripOccurrenceNoteRequiredError,
  TripOccurrencePhotoMinimumNotMetError,
  TripOccurrenceReferenceNumberRequiredError,
  TripOccurrenceSignatureRequiredError,
  TripStateTransitionNotAllowedError,
  TripStopNotReachableError,
} from '../../src/trips/domain/trip.error.js'
import { describeOccurrenceRequirementRefusal } from '../../src/whatsapp-commands/application/driver-occurrence-refusal.service.js'
import {
  CATALOG_BOT_SPEECH,
  renderBotSpeechLine,
  type BotSpeechLine,
} from '../../src/whatsapp-commands/application/whatsapp-bot-speech.service.js'
import {
  describeWhatsAppDriverEventResult,
  OCCURRENCE_REQUIREMENT_MESSAGES,
  type WhatsAppDriverEventAudience,
} from '../../src/whatsapp-commands/application/whatsapp-driver-event-speech.service.js'
import {
  classifyWhatsAppDriverEventError,
  createWhatsAppDriverEvents,
  refuseWhatsAppDriverEvent,
  type WhatsAppDriverEventPorts,
  type WhatsAppDriverEventResult,
} from '../../src/whatsapp-commands/application/whatsapp-driver-events.service.js'
import { BOT_SPEECH_DEFAULTS } from '../../src/whatsapp-commands/domain/whatsapp-bot-speech.constant.js'
import {
  DRIVER_FLOW_NODE,
  DRIVER_TRANSITION_BLOCK_MESSAGES,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-flow.constant.js'
import {
  describeStopReference,
  resolveArrivalStop,
  resolveDepartureStop,
  type WhatsAppStopCandidate,
} from '../../src/trips/domain/driver-stop-resolution.policy.js'

const ACTOR = {
  actorUserId: '00000000-0000-4000-8000-000000002931',
  companyId: '00000000-0000-4000-8000-000000002932',
  driverId: '00000000-0000-4000-8000-000000002933',
} as const
const STOP_ID = '00000000-0000-4000-8000-000000002934'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000002935'
const SENT_AT = new Date('2026-11-04T12:00:00.000Z')
const LOCATION = { accuracyMeters: 12, latitude: -21.17, longitude: -47.81 } as never

type Call = { readonly port: string; readonly input: Record<string, unknown> }

function buildPorts(overrides: Partial<WhatsAppDriverEventPorts> = {}): {
  readonly calls: Call[]
  readonly ports: WhatsAppDriverEventPorts
} {
  const calls: Call[] = []
  const record =
    <T>(port: string, value: T) =>
    async (input: object): Promise<T> => {
      calls.push({ input: input as Record<string, unknown>, port })
      return value
    }
  return {
    calls,
    ports: {
      registerOccurrence: record('registerOccurrence', { id: 'o' }),
      reportArrival: record('reportArrival', { id: 'e' }),
      reportDelivery: record('reportDelivery', {
        alreadySettled: false,
        proofPending: true,
        stopCompleted: true,
        tripCompleted: false,
      }),
      reportDeparture: record('reportDeparture', { changed: true }),
      reportReturn: record('reportReturn', { alreadySettled: false }),
      ...overrides,
    },
  }
}

const failWith = (error: unknown) => async () => Promise.reject(error)

const stopInput = {
  ...ACTOR,
  idempotencyKey: 'k1',
  location: LOCATION,
  sentAt: SENT_AT,
  stopId: STOP_ID,
}
const documentInput = { ...ACTOR, documentId: DOCUMENT_ID, idempotencyKey: 'k2', location: null }

describe('camada de eventos do motorista no WhatsApp (spec 293 T11)', () => {
  test('saí chama a função do app com a hora da mensagem como toque e o ponto compartilhado', async () => {
    const { calls, ports } = buildPorts()
    const result = await createWhatsAppDriverEvents(ports).depart(stopInput)

    expect(result).toEqual({ event: 'depart', kind: 'registered' })
    expect(calls).toEqual([
      {
        input: {
          ...ACTOR,
          idempotencyKey: 'k1',
          location: LOCATION,
          stopId: STOP_ID,
          tappedAt: SENT_AT,
        },
        port: 'reportDeparture',
      },
    ])
  })

  test('saí repetido (o app não muda nada) é "já estava registrado"', async () => {
    const { ports } = buildPorts({ reportDeparture: async () => ({ changed: false }) })
    expect(await createWhatsAppDriverEvents(ports).depart(stopInput)).toEqual({
      event: 'depart',
      kind: 'already_registered',
    })
  })

  test('saí com outra parada a caminho é recusa tipada com a sequência', async () => {
    const { ports } = buildPorts({
      reportDeparture: failWith(
        new TripHasStopEnRouteError({ enRouteStopId: 'x', enRouteStopSequence: '3' }),
      ),
    })
    expect(await createWhatsAppDriverEvents(ports).depart(stopInput)).toEqual({
      event: 'depart',
      kind: 'refused',
      refusal: { code: 'stop_en_route', enRouteStopSequence: '3' },
    })
  })

  test('cheguei registra pela função do app; parada de outro motorista é recusada', async () => {
    const { calls, ports } = buildPorts()
    const events = createWhatsAppDriverEvents(ports)
    expect(await events.arrive(stopInput)).toEqual({ event: 'arrive', kind: 'registered' })
    expect(calls[0]?.port).toBe('reportArrival')
    expect(calls[0]?.input['tappedAt']).toBe(SENT_AT)

    const refused = createWhatsAppDriverEvents(
      buildPorts({ reportArrival: failWith(new TripStopNotReachableError()) }).ports,
    )
    expect(await refused.arrive(stopInput)).toMatchObject({
      kind: 'refused',
      refusal: { code: 'stop_not_reachable' },
    })
  })

  test('entreguei devolve os detalhes da baixa; repetido é "já estava registrado"', async () => {
    const { calls, ports } = buildPorts()
    expect(await createWhatsAppDriverEvents(ports).deliver(documentInput)).toEqual({
      details: { proofPending: true, stopCompleted: true, tripCompleted: false },
      event: 'deliver',
      kind: 'registered',
    })
    expect(calls[0]).toEqual({ input: documentInput, port: 'reportDelivery' })

    const again = createWhatsAppDriverEvents(
      buildPorts({ reportDelivery: async () => ({ alreadySettled: true }) }).ports,
    )
    expect(await again.deliver(documentInput)).toEqual({
      event: 'deliver',
      kind: 'already_registered',
    })
  })

  test('nota já fechada ou fora da viagem vira recusa, nunca erro cru', async () => {
    const blocked = createWhatsAppDriverEvents(
      buildPorts({
        reportDelivery: failWith(
          new TripStateTransitionNotAllowedError('TRIP_DOCUMENT_ALREADY_CLOSED'),
        ),
      }).ports,
    )
    expect(await blocked.deliver(documentInput)).toEqual({
      event: 'deliver',
      kind: 'refused',
      refusal: { code: 'transition_blocked', reason: 'TRIP_DOCUMENT_ALREADY_CLOSED' },
    })

    const gone = createWhatsAppDriverEvents(
      buildPorts({ reportReturn: failWith(new TripDocumentNotReachableError()) }).ports,
    )
    expect(await gone.returnDocument({ ...documentInput, reason: 'recipient_absent' })).toEqual({
      event: 'return',
      kind: 'refused',
      refusal: { code: 'document_not_reachable' },
    })
  })

  test('devolvi passa o motivo; ocorrência passa tipo e observação, sem produto', async () => {
    const { calls, ports } = buildPorts()
    const events = createWhatsAppDriverEvents(ports)
    await events.returnDocument({ ...documentInput, reason: 'recipient_absent' })
    await events.registerOccurrence({
      ...documentInput,
      note: 'portão fechado',
      occurrenceTypeId: 't',
    })

    expect(calls[0]).toEqual({
      input: { ...documentInput, reason: 'recipient_absent' },
      port: 'reportReturn',
    })
    expect(calls[1]).toEqual({
      input: { ...documentInput, note: 'portão fechado', occurrenceTypeId: 't', productCode: '' },
      port: 'registerOccurrence',
    })
  })

  test('erro que não é de negócio sobe', async () => {
    const boom = new Error('db down')
    const events = createWhatsAppDriverEvents(buildPorts({ reportDelivery: failWith(boom) }).ports)
    await expect(events.deliver(documentInput)).rejects.toBe(boom)
  })

  test('a exigência do tipo vira o campo que falta', () => {
    const cases: readonly [unknown, string][] = [
      [new TripOccurrenceNoteRequiredError(), 'note'],
      [new TripOccurrenceSignatureRequiredError(), 'signature'],
      [new TripOccurrenceAttachmentRequiredError(), 'photo'],
      [new TripOccurrencePhotoMinimumNotMetError(), 'photo'],
      [new TripOccurrenceItemsRequiredError(), 'items'],
      [new TripOccurrenceItemsMinimumNotMetError(), 'items'],
      [new TripOccurrenceReferenceNumberRequiredError(), 'reference_number'],
      [new TripOccurrenceDeclaredAmountRequiredError('declaredAmount'), 'declared_amount'],
      [new OccurrenceItemQuantityAboveDocumentError('quantity'), 'declared_amount'],
      [new OccurrenceTypeNotAvailableForContractorError(), 'contractor_scope'],
    ]
    for (const [error, field] of cases) {
      expect(classifyWhatsAppDriverEventError(error)).toEqual({
        code: 'occurrence_requirement',
        field: field as never,
      })
    }
    expect(classifyWhatsAppDriverEventError(new Error('x'))).toBeUndefined()
  })

  test('a recusa da conversa individual mantém frase e passo de volta', () => {
    expect(describeOccurrenceRequirementRefusal(new TripOccurrenceNoteRequiredError())).toEqual({
      message: OCCURRENCE_REQUIREMENT_MESSAGES.note,
      next: DRIVER_FLOW_NODE.notePrompt,
    })
    expect(
      describeOccurrenceRequirementRefusal(new OccurrenceTypeNotAvailableForContractorError()),
    ).toMatchObject({ next: DRIVER_FLOW_NODE.listOccurrenceTypes })
    expect(
      describeOccurrenceRequirementRefusal(new TripOccurrenceSignatureRequiredError()),
    ).toMatchObject({ next: DRIVER_FLOW_NODE.tripMenu })
    expect(
      describeOccurrenceRequirementRefusal(new TripDocumentNotReachableError()),
    ).toBeUndefined()
  })
})

describe('falas dos eventos: motorista e grupo (spec 293 T11)', () => {
  const DRIVER: WhatsAppDriverEventAudience = { kind: 'driver' }
  const GROUP: WhatsAppDriverEventAudience = { documentNumber: '17234', kind: 'group' }

  async function render(line: BotSpeechLine): Promise<string> {
    return renderBotSpeechLine({ companyId: ACTOR.companyId, line, speech: CATALOG_BOT_SPEECH })
  }

  const registered = (
    event: WhatsAppDriverEventResult['event'],
    details?: { proofPending: boolean; stopCompleted: boolean; tripCompleted: boolean },
  ): WhatsAppDriverEventResult => ({
    event,
    kind: 'registered',
    ...(details === undefined ? {} : { details }),
  })

  test('o motorista ouve as frases que a conversa individual já usava', () => {
    expect(describeWhatsAppDriverEventResult(registered('deliver'), DRIVER)).toEqual({
      key: 'deliveryRegistered',
    })
    expect(describeWhatsAppDriverEventResult(registered('return'), DRIVER)).toEqual({
      key: 'returnRegistered',
    })
    expect(describeWhatsAppDriverEventResult(registered('occurrence'), DRIVER)).toEqual({
      key: 'occurrenceRegistered',
    })
    expect(
      describeWhatsAppDriverEventResult({ event: 'deliver', kind: 'already_registered' }, DRIVER),
    ).toEqual({ key: 'alreadyRegistered' })
    expect(describeWhatsAppDriverEventResult(registered('depart'), DRIVER)).toEqual({
      key: 'departureRegistered',
    })
    expect(describeWhatsAppDriverEventResult(registered('arrive'), DRIVER)).toEqual({
      key: 'arrivalRegistered',
    })
  })

  test('o grupo ouve só o número da nota, com parada e viagem concluídas', async () => {
    const details = { proofPending: false, stopCompleted: false, tripCompleted: false }
    expect(
      await render(describeWhatsAppDriverEventResult(registered('deliver', details), GROUP)),
    ).toBe('NF 17234 entregue. ✅')
    expect(
      await render(
        describeWhatsAppDriverEventResult(
          registered('deliver', { ...details, stopCompleted: true }),
          GROUP,
        ),
      ),
    ).toBe('NF 17234 entregue. Parada concluída. ✅')
    expect(
      await render(
        describeWhatsAppDriverEventResult(
          registered('deliver', { ...details, stopCompleted: true, tripCompleted: true }),
          GROUP,
        ),
      ),
    ).toBe('NF 17234 entregue. Viagem concluída. 🏁')
    expect(await render(describeWhatsAppDriverEventResult(registered('return'), GROUP))).toBe(
      'NF 17234 devolvida. ↩️',
    )
    expect(
      await render(
        describeWhatsAppDriverEventResult({ event: 'return', kind: 'already_registered' }, GROUP),
      ),
    ).toBe('NF 17234 já estava registrada.')
  })

  test('nenhuma fala do grupo deixa variável sem valor nem cita cliente', async () => {
    const results: WhatsAppDriverEventResult[] = [
      registered('depart'),
      registered('arrive'),
      registered('deliver'),
      registered('return'),
      registered('occurrence'),
      { event: 'deliver', kind: 'already_registered' },
      refuseWhatsAppDriverEvent('deliver', { code: 'document_not_reachable' }),
      refuseWhatsAppDriverEvent('deliver', { code: 'driver_without_access' }),
      refuseWhatsAppDriverEvent('depart', { code: 'stop_en_route', enRouteStopSequence: '2' }),
      refuseWhatsAppDriverEvent('arrive', { code: 'stop_not_reachable' }),
    ]
    for (const result of results) {
      for (const audience of [GROUP, { kind: 'group' } as const, DRIVER]) {
        const text = await render(describeWhatsAppDriverEventResult(result, audience))
        expect(text).not.toMatch(/\{\{/)
        expect(text.length).toBeGreaterThan(0)
      }
    }
  })

  test('recusas: portão com o número da nota no grupo, acesso e parada a caminho', async () => {
    const blocked = refuseWhatsAppDriverEvent('deliver', {
      code: 'transition_blocked',
      reason: 'TRIP_DOCUMENT_ALREADY_CLOSED',
    })
    expect(await render(describeWhatsAppDriverEventResult(blocked, GROUP))).toBe(
      `NF 17234: ${DRIVER_TRANSITION_BLOCK_MESSAGES.TRIP_DOCUMENT_ALREADY_CLOSED}`,
    )
    expect(await render(describeWhatsAppDriverEventResult(blocked, DRIVER))).toBe(
      DRIVER_TRANSITION_BLOCK_MESSAGES.TRIP_DOCUMENT_ALREADY_CLOSED,
    )
    expect(
      await render(
        describeWhatsAppDriverEventResult(
          refuseWhatsAppDriverEvent('occurrence', { code: 'driver_without_access' }),
          GROUP,
        ),
      ),
    ).toBe(BOT_SPEECH_DEFAULTS.groupDriverWithoutAccess)
    expect(
      await render(
        describeWhatsAppDriverEventResult(
          refuseWhatsAppDriverEvent('depart', { code: 'stop_en_route', enRouteStopSequence: '2' }),
          DRIVER,
        ),
      ),
    ).toBe('A parada 2 já está a caminho. Registre a chegada nela antes de sair para outra.')
    expect(
      await render(
        describeWhatsAppDriverEventResult(
          refuseWhatsAppDriverEvent('occurrence', {
            code: 'occurrence_requirement',
            field: 'photo',
          }),
          GROUP,
        ),
      ),
    ).toBe(OCCURRENCE_REQUIREMENT_MESSAGES.photo)
  })
})

describe('qual parada o saí e o cheguei miram (spec 293 T11)', () => {
  function stop(
    sequence: number,
    overrides: Partial<WhatsAppStopCandidate> = {},
  ): WhatsAppStopCandidate {
    return {
      arrivedAt: null,
      completedAt: null,
      documents: [{ number: `${17000 + sequence}`, separationStatus: 'loaded' }],
      enRouteSince: null,
      id: `stop-${sequence}`,
      sequence,
      ...overrides,
    }
  }

  test('saí: uma pendente vai direto; várias pedem escolha, com a primeira do roteiro sugerida', () => {
    expect(resolveDepartureStop([stop(1, { completedAt: 'x' }), stop(2)])).toEqual({
      kind: 'single',
      stop: stop(2),
    })
    const choose = resolveDepartureStop([stop(3), stop(2)])
    expect(choose).toMatchObject({ kind: 'choose', suggested: { id: 'stop-2' } })
    expect(choose.kind === 'choose' ? choose.stops.map((item) => item.id) : []).toEqual([
      'stop-2',
      'stop-3',
    ])
  })

  test('saí com uma parada a caminho aponta para ela; sem pendentes é nenhuma', () => {
    expect(resolveDepartureStop([stop(1, { enRouteSince: 'x' }), stop(2)])).toEqual({
      kind: 'en_route',
      stop: stop(1, { enRouteSince: 'x' }),
    })
    expect(
      resolveDepartureStop([
        stop(1, { arrivedAt: 'x' }),
        stop(2, { documents: [{ number: '1', separationStatus: 'delivered' }] }),
      ]),
    ).toEqual({ kind: 'none' })
  })

  test('cheguei: a parada a caminho vence; sem ela, as que não chegaram', () => {
    expect(resolveArrivalStop([stop(1), stop(2, { enRouteSince: 'x' })])).toMatchObject({
      kind: 'single',
      stop: { id: 'stop-2' },
    })
    expect(resolveArrivalStop([stop(1, { arrivedAt: 'x' }), stop(2)])).toMatchObject({
      kind: 'single',
      stop: { id: 'stop-2' },
    })
    expect(resolveArrivalStop([stop(2), stop(1)])).toMatchObject({
      kind: 'choose',
      suggested: { id: 'stop-1' },
    })
  })

  test('a parada é citada pela nota, nunca pelo destinatário', () => {
    expect(describeStopReference(stop(1))).toBe('NF 17001')
    expect(
      describeStopReference(
        stop(1, {
          documents: [
            { number: '17001', separationStatus: 'loaded' },
            { number: '17002', separationStatus: 'loaded' },
            { number: '17003', separationStatus: 'loaded' },
          ],
        }),
      ),
    ).toBe('NF 17001 e mais 2')
    expect(describeStopReference(stop(4, { documents: [] }))).toBe('parada 4')
  })
})
