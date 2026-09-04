/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 082 D8: o motivo tipado da parada vira aviso pelo template da transportadora — e motivo
 * sem template grava a ocorrência e segue, sem aviso e sem erro.
 */
import { describe, expect, it } from 'bun:test'

import {
  NOTIFICATION_CATALOG,
  NOTIFICATION_TEMPLATE_KEY,
} from '../../src/notification/domain/notification-catalog.constant.js'
import { TRIP_STOP_OCCURRENCE_KINDS } from '../../src/database/trip.schema.js'
import { resolveStopOccurrenceTemplateKey } from '../../src/trips/domain/stop-occurrence-notification.policy.js'
import { createStopOccurrenceNotifier } from '../../src/trips/infrastructure/stop-occurrence-notifier.gateway.js'
import { reportStopOccurrence } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import type { TripQueryable } from '../../src/trips/infrastructure/trip-queryable.type.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const STOP_ID = '00000000-0000-4000-8000-000000000005'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'
const DISPATCHER = '00000000-0000-4000-8000-00000000000d'
const OCCURRENCE_ID = '00000000-0000-4000-8000-0000000000aa'

/**
 * ⚠️ **Paridade com a cópia do worker** (`worker-transportada/src/notification/notification.constant.ts`):
 * os literais são fixados aqui e no contrato gêmeo do worker
 * (`test/notification/occurrence-keys.contract.ts`). Mudou de um lado? mude do outro.
 */
const EXPECTED_KEYS = {
  appointment_required: 'trip.occurrence-appointment-required',
  dock_closed: 'trip.occurrence-dock-closed',
  long_wait: 'trip.occurrence-long-wait',
  unexpected_charge: 'trip.occurrence-unexpected-charge',
} as const

const EXPECTED_PLACEHOLDERS = ['documentLabel', 'occurredAt', 'stopLabel']

const SILENT_LOGGER = { warn: () => undefined }

/** Cadeia mínima do Drizzle: cada `limit` entrega a próxima resposta da fila, na ordem. */
function queryableAnswering(results: readonly unknown[][]): TripQueryable {
  const pending = [...results]
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    limit: async () => pending.shift() ?? [],
    orderBy: () => chain,
    select: () => chain,
    where: () => chain,
  }
  return chain as unknown as TripQueryable
}

/** Toca no banco → falha: o motivo sem template tem de decidir antes de qualquer consulta. */
const UNTOUCHABLE_QUERYABLE = new Proxy(
  {},
  {
    get() {
      throw new Error('o banco não pode ser consultado para motivo sem template')
    },
  },
) as TripQueryable

describe('chaves de template por motivo de parada (spec 082 D8)', () => {
  it('cada motivo com aviso tem a chave fixada, em paridade com a cópia do worker', () => {
    expect(NOTIFICATION_TEMPLATE_KEY.TRIP_OCCURRENCE_APPOINTMENT_REQUIRED).toBe(
      EXPECTED_KEYS.appointment_required,
    )
    expect(NOTIFICATION_TEMPLATE_KEY.TRIP_OCCURRENCE_DOCK_CLOSED).toBe(EXPECTED_KEYS.dock_closed)
    expect(NOTIFICATION_TEMPLATE_KEY.TRIP_OCCURRENCE_LONG_WAIT).toBe(EXPECTED_KEYS.long_wait)
    expect(NOTIFICATION_TEMPLATE_KEY.TRIP_OCCURRENCE_UNEXPECTED_CHARGE).toBe(
      EXPECTED_KEYS.unexpected_charge,
    )
  })

  it('a política mapeia todo motivo do catálogo menos `other`, e nada fora dele', () => {
    for (const kind of TRIP_STOP_OCCURRENCE_KINDS) {
      const key = resolveStopOccurrenceTemplateKey(kind)
      if (kind === 'other') {
        expect(key).toBeNull()
      } else {
        expect(key).toBe(EXPECTED_KEYS[kind])
      }
    }
    expect(resolveStopOccurrenceTemplateKey('motivo_que_nao_existe')).toBeNull()
  })

  it('todo template de motivo declara exatamente nota, hora e parada — nunca PII', () => {
    for (const key of Object.values(EXPECTED_KEYS)) {
      const entry = NOTIFICATION_CATALOG.find((candidate) => candidate.templateKey === key)
      expect(entry).toBeDefined()
      expect([...(entry?.placeholders ?? [])].toSorted()).toEqual(EXPECTED_PLACEHOLDERS)
    }
  })
})

describe('disparo do aviso de ocorrência de parada (spec 082 D8)', () => {
  function worldWithStop() {
    const state = createFieldReportState()
    state.stops.set(STOP_ID, { arrivedAt: new Date(), tripId: TRIP_ID, tripStatus: 'in_transit' })
    return createFieldReportUnitOfWork(state)
  }

  it('ocorrência com template enfileira uma mensagem para quem despachou', async () => {
    const sent: Record<string, unknown>[] = []
    const notifier = createStopOccurrenceNotifier({
      logger: SILENT_LOGGER,
      queryable: queryableAnswering([
        [{ label: 'RUA MIGUEL PETRONI, 1166, SAO CARLOS, SP', tripId: TRIP_ID }],
        [{ actorUserId: DISPATCHER }],
      ]),
      send: async (params) => {
        sent.push({ ...params })
      },
    })

    await notifier.notify({
      companyId: COMPANY_ID,
      documentId: null,
      kind: 'long_wait',
      occurredAt: new Date('2026-09-03T15:30:00.000Z'),
      occurrenceId: OCCURRENCE_ID,
      stopId: STOP_ID,
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]?.templateKey).toBe(EXPECTED_KEYS.long_wait)
    expect(sent[0]?.recipientUserId).toBe(DISPATCHER)
    expect(sent[0]?.dedupeKey).toContain(OCCURRENCE_ID)
    const payload = sent[0]?.payload as Record<string, string>
    expect(Object.keys(payload).toSorted()).toEqual(EXPECTED_PLACEHOLDERS)
    /** Relato sem nota não renderiza buraco no template. */
    expect(payload.documentLabel).toBe('—')
    expect(payload.stopLabel).toContain('MIGUEL PETRONI')
  })

  it('motivo sem template não enfileira nada, não toca o banco e não falha', async () => {
    const sent: unknown[] = []
    const notifier = createStopOccurrenceNotifier({
      logger: SILENT_LOGGER,
      queryable: UNTOUCHABLE_QUERYABLE,
      send: async (params) => {
        sent.push(params)
      },
    })

    await notifier.notify({
      companyId: COMPANY_ID,
      documentId: null,
      kind: 'other',
      occurredAt: new Date(),
      occurrenceId: OCCURRENCE_ID,
      stopId: STOP_ID,
    })

    expect(sent).toEqual([])
  })

  /** Ocorrência de separação nunca chega aqui, mas o teórico responde igual: silêncio. */
  it('viagem sem despacho não avisa ninguém', async () => {
    const sent: unknown[] = []
    const notifier = createStopOccurrenceNotifier({
      logger: SILENT_LOGGER,
      queryable: queryableAnswering([[{ label: 'PARADA', tripId: TRIP_ID }], []]),
      send: async (params) => {
        sent.push(params)
      },
    })

    await notifier.notify({
      companyId: COMPANY_ID,
      documentId: null,
      kind: 'dock_closed',
      occurredAt: new Date(),
      occurrenceId: OCCURRENCE_ID,
      stopId: STOP_ID,
    })

    expect(sent).toEqual([])
  })

  it('fila fora do ar não derruba o aviso nem o registro', async () => {
    const warnings: string[] = []
    const notifier = createStopOccurrenceNotifier({
      logger: { warn: (event) => warnings.push(event) },
      queryable: queryableAnswering([
        [{ label: 'PARADA', tripId: TRIP_ID }],
        [{ actorUserId: DISPATCHER }],
      ]),
      send: async () => {
        throw new Error('fila fora do ar')
      },
    })

    await notifier.notify({
      companyId: COMPANY_ID,
      documentId: null,
      kind: 'unexpected_charge',
      occurredAt: new Date(),
      occurrenceId: OCCURRENCE_ID,
      stopId: STOP_ID,
    })

    expect(warnings).toEqual(['trip_stop_occurrence_notification_failed'])
  })

  it('o registro entrega ao notificador a ocorrência recém-gravada, e segue sem ele', async () => {
    const notified: { readonly kind: string; readonly occurrenceId: string }[] = []

    const result = await reportStopOccurrence({
      actorUserId: '00000000-0000-4000-8000-000000000002',
      attachmentObjectId: null,
      companyId: COMPANY_ID,
      description: 'Duas horas na fila da doca',
      documentId: null,
      driverId: '00000000-0000-4000-8000-000000000003',
      idempotencyKey: 'chave-1',
      kind: 'long_wait',
      notifier: {
        async notify(input) {
          notified.push({ kind: input.kind, occurrenceId: input.occurrenceId })
        },
      },
      stopId: STOP_ID,
      unitOfWork: worldWithStop(),
    })

    expect(notified).toEqual([{ kind: 'long_wait', occurrenceId: result.id }])

    const withoutNotifier = await reportStopOccurrence({
      actorUserId: '00000000-0000-4000-8000-000000000002',
      attachmentObjectId: null,
      companyId: COMPANY_ID,
      description: 'Sem trilho de notificação',
      documentId: null,
      driverId: '00000000-0000-4000-8000-000000000003',
      idempotencyKey: 'chave-2',
      kind: 'long_wait',
      stopId: STOP_ID,
      unitOfWork: worldWithStop(),
    })
    expect(withoutNotifier.id).toStartWith('occurrence-')
  })
})
