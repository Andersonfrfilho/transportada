/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 275: a ocorrência que o motorista registra numa nota avisa o painel — sempre, para os responsáveis (lista
 * efetiva 267/271) e quem despachou, sem duplicar. Reverte o "sem notificador" da 079.
 */
import { describe, expect, test } from 'bun:test'

import { createDriverOccurrenceNotifier } from '../../src/trips/application/driver-occurrence-notifier.service.js'
import type {
  DriverOccurrenceNotification,
  DriverOccurrenceNotificationReader,
} from '../../src/trips/application/driver-occurrence-notifier.service.js'
import type { OccurrenceWatcherCandidate } from '../../src/contractor-mail/domain/occurrence-watcher.policy.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'
import { NEUTRAL_DOCUMENT_PRODUCT_LINE } from '../fixtures/document-product.fixture.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const DOCUMENT = '00000000-0000-4000-8000-000000000017'
const TRIP = '00000000-0000-4000-8000-000000000011'
const DRIVER = '00000000-0000-4000-8000-00000000000d'
const ACTOR = '00000000-0000-4000-8000-00000000000f'
const TIPO = '00000000-0000-4000-8000-0000000000e1'
const OCCURRENCE = '00000000-0000-4000-8000-0000000000c1'
const ANA = '00000000-0000-4000-8000-0000000000a1'
const BETO = '00000000-0000-4000-8000-0000000000b1'
const CARLA = '00000000-0000-4000-8000-0000000000c9'
const LEGACY_TEMPLATE = 'trip.delivery-occurrence'

function readPort(type: { readonly emailTemplateKey: null | string }) {
  return {
    async findConfirmedUpload() {
      return null
    },
    async findOccurrenceType() {
      return {
        active: true,
        allowsMultipleItems: true,
        attachmentMode: 'off' as const,
        emailTemplateKey: type.emailTemplateKey,
        id: TIPO,
        name: 'Cliente ausente',
        noteMode: 'optional' as const,
        /** D1: o aviso do motorista não olha a flag do escritório. */
        notifies: false,
        stage: 'delivery' as const,
      }
    },
    async findOccurrenceTypeOverrides() {
      return { contractorOverrides: [], recipientOverrides: [] }
    },
    async findReachableDocument() {
      return { tripId: TRIP }
    },
    async listDocumentProducts() {
      return [{ ...NEUTRAL_DOCUMENT_PRODUCT_LINE, code: 'ZG-4410', description: 'CAIXA' }]
    },
  }
}

function registrar(input: {
  readonly channel?: (typeof TRIP_FIELD_CHANNELS)[keyof typeof TRIP_FIELD_CHANNELS]
  readonly emailTemplateKey?: null | string
  readonly notify: (call: DriverOccurrenceNotification) => Promise<void>
}) {
  const state = createFieldReportState({
    documents: new Map([
      [
        DOCUMENT,
        {
          separationStatus: 'pending',
          stopId: null,
          tripId: TRIP,
          tripStatus: 'on_delivery_route',
        },
      ],
    ]),
  })
  return registerDriverOccurrence({
    actorUserId: ACTOR,
    attachmentObjectId: undefined,
    ...(input.channel === undefined ? {} : { channel: input.channel }),
    companyId: COMPANY,
    documentId: DOCUMENT,
    driverId: DRIVER,
    idempotencyKey: crypto.randomUUID(),
    note: 'cliente ausente',
    notifier: { notify: input.notify },
    occurrenceTypeId: TIPO,
    productCode: '',
    repository: readPort({ emailTemplateKey: input.emailTemplateKey ?? null }),
    unitOfWork: createFieldReportUnitOfWork(state),
  })
}

describe('o registro do motorista avisa o painel (spec 275)', () => {
  test('tipo com notifies = false avisa, com o template legado e os ids da ocorrência', async () => {
    const calls: DriverOccurrenceNotification[] = []
    const saved = await registrar({ notify: async (call) => void calls.push(call) })

    expect(calls).toEqual([
      {
        companyId: COMPANY,
        documentId: DOCUMENT,
        occurrenceId: saved.id,
        occurrenceTypeId: TIPO,
        occurrenceTypeName: 'Cliente ausente',
        templateKey: LEGACY_TEMPLATE,
        tripId: TRIP,
      },
    ])
  })

  test('o template do tipo vence o legado', async () => {
    const calls: DriverOccurrenceNotification[] = []
    await registrar({
      emailTemplateKey: 'empresa.aviso-ausente',
      notify: async (call) => void calls.push(call),
    })
    expect(calls.map((call) => call.templateKey)).toEqual(['empresa.aviso-ausente'])
  })

  test('pelo WhatsApp o mesmo caso de uso avisa', async () => {
    const calls: DriverOccurrenceNotification[] = []
    await registrar({
      channel: TRIP_FIELD_CHANNELS.whatsapp,
      notify: async (call) => void calls.push(call),
    })
    expect(calls).toHaveLength(1)
  })

  test('o notificador que falha não derruba o registro', async () => {
    const saved = await registrar({
      notify: async () => {
        throw new Error('fila fora do ar')
      },
    })
    expect(saved.typeName).toBe('Cliente ausente')
  })
})

type Sent = {
  readonly dedupeKey: string
  readonly recipientUserId: string
  readonly payload: object
  readonly templateKey: string
}

function candidate(
  userId: string,
  address = `${userId.slice(-2)}@exemplo.com.br`,
): OccurrenceWatcherCandidate {
  return { address, name: userId, status: 'active', userId }
}

function notifierWith(input: {
  readonly company?: readonly OccurrenceWatcherCandidate[]
  readonly dispatcher?: null | string
  readonly failFor?: string
  readonly readerFails?: boolean
}) {
  const sent: Sent[] = []
  const warnings: { readonly event: string; readonly meta: Record<string, unknown> | undefined }[] =
    []
  const reader: DriverOccurrenceNotificationReader = {
    async findDispatcherUserId() {
      return input.dispatcher === undefined ? BETO : input.dispatcher
    },
    async findWatcherCandidates() {
      if (input.readerFails === true) throw new Error('banco fora do ar')
      return { company: input.company ?? [], contractor: [], type: [] }
    },
    async readLabels() {
      return { documentLabel: '883658/1', stopLabel: 'RUA MIGUEL PETRONI, 1166' }
    },
  }
  const notifier = createDriverOccurrenceNotifier({
    logger: { warn: (event, meta) => void warnings.push({ event, meta }) },
    reader,
    send: async (params) => {
      if (params.recipientUserId === input.failFor) throw new Error('recusado')
      sent.push({
        dedupeKey: params.dedupeKey,
        payload: params.payload,
        recipientUserId: params.recipientUserId,
        templateKey: params.templateKey,
      })
    },
  })
  return { notifier, sent, warnings }
}

const NOTIFICATION: DriverOccurrenceNotification = {
  companyId: COMPANY,
  documentId: DOCUMENT,
  occurrenceId: OCCURRENCE,
  occurrenceTypeId: TIPO,
  occurrenceTypeName: 'Cliente ausente',
  templateKey: LEGACY_TEMPLATE,
  tripId: TRIP,
}

describe('quem recebe o aviso do motorista (spec 275 D2/D5/D6)', () => {
  test('responsáveis mais quem despachou, um aviso por destinatário com a chave dele', async () => {
    const { notifier, sent } = notifierWith({ company: [candidate(ANA), candidate(CARLA)] })
    await notifier.notify(NOTIFICATION)

    expect(sent.map((item) => item.recipientUserId).sort()).toEqual([ANA, BETO, CARLA].sort())
    expect(new Set(sent.map((item) => item.dedupeKey)).size).toBe(3)
    expect(sent.find((item) => item.recipientUserId === ANA)?.dedupeKey).toBe(
      `${LEGACY_TEMPLATE}:${OCCURRENCE}:${ANA}`,
    )
    expect(sent.every((item) => item.templateKey === LEGACY_TEMPLATE)).toBe(true)
  })

  test('quem despachou e também é responsável recebe um aviso só', async () => {
    const { notifier, sent } = notifierWith({ company: [candidate(ANA), candidate(BETO)] })
    await notifier.notify(NOTIFICATION)
    expect(sent.map((item) => item.recipientUserId).sort()).toEqual([ANA, BETO].sort())
  })

  test('sem lista configurada, só quem despachou', async () => {
    const { notifier, sent } = notifierWith({})
    await notifier.notify(NOTIFICATION)
    expect(sent.map((item) => item.recipientUserId)).toEqual([BETO])
  })

  test('o payload leva os ids opacos que o painel usa para abrir a ocorrência, e nenhum dado pessoal', async () => {
    const { notifier, sent } = notifierWith({})
    await notifier.notify(NOTIFICATION)
    expect(sent[0]?.payload).toEqual({
      documentId: DOCUMENT,
      documentLabel: expect.any(String),
      occurrenceId: OCCURRENCE,
      occurrenceType: 'Cliente ausente',
      stopLabel: expect.any(String),
      tripId: TRIP,
    })
  })

  test('responsável sem e-mail ou inativo fica fora (a lista efetiva da 267)', async () => {
    const { notifier, sent } = notifierWith({
      company: [candidate(ANA, ''), { ...candidate(CARLA), status: 'inactive' }],
    })
    await notifier.notify(NOTIFICATION)
    expect(sent.map((item) => item.recipientUserId)).toEqual([BETO])
  })

  test('sem lista e sem despacho, ninguém', async () => {
    const { notifier, sent } = notifierWith({ dispatcher: null })
    await notifier.notify(NOTIFICATION)
    expect(sent).toEqual([])
  })

  test('um destinatário que falha não impede os outros, e o log não leva PII', async () => {
    const { notifier, sent, warnings } = notifierWith({
      company: [candidate(ANA)],
      failFor: ANA,
    })
    await notifier.notify(NOTIFICATION)
    expect(sent.map((item) => item.recipientUserId)).toEqual([BETO])
    expect(warnings).toHaveLength(1)
    expect(JSON.stringify(warnings)).not.toContain('@')
    expect(warnings[0]?.meta).toMatchObject({ failed: 1, recipients: 2 })
  })

  test('a leitura que falha é engolida com log', async () => {
    const { notifier, sent, warnings } = notifierWith({ readerFails: true })
    await notifier.notify(NOTIFICATION)
    expect(sent).toEqual([])
    expect(warnings.map((item) => item.event)).toEqual(['driver_occurrence_notification_failed'])
  })
})

describe('a ligação no main.ts (spec 275)', () => {
  test('app e WhatsApp passam o notificador; o escritório segue com o da 079', async () => {
    const source = await Bun.file(new URL('../../src/main.ts', import.meta.url)).text()
    const driverCalls = source.split('await registerDriverOccurrence({').slice(1)
    expect(driverCalls).toHaveLength(2)
    for (const call of driverCalls) {
      expect(call.slice(0, call.indexOf('unitOfWork:'))).toContain(
        'notifier: driverOccurrenceNotifier',
      )
    }
    expect(source).toContain('notifier: occurrenceNotifier')
  })
})
