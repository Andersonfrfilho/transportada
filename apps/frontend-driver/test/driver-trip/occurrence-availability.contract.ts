/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { buildEventQueueView } from '../../src/modules/driver-trip/shared/eventQueueView.service'
import type { DriverOccurrenceType } from '../../src/modules/driver-trip/shared/driverTrip.types'
import { isDriverOccurrenceType } from '../../src/modules/driver-trip/shared/driverTrip.types'
import {
  isAwaitingTapLocation,
  listLocatedReportKeys,
  withLegacyLocation,
  type QueuedReport,
} from '../../src/modules/driver-trip/shared/offlineQueue.service'
import { resolveOccurrenceAvailability } from '../../src/modules/driver-trip/shared/occurrenceAvailability.service'
import type { RouteOccurrenceEntry } from '../../src/modules/driver-trip/shared/routeOccurrenceView.types'

/** Spec 315 (D10, T7b): o tipo com espera mínima só abre depois de `chegada + N min`; o servidor é quem cobra. */
const ARRIVED = '2026-11-17T20:00:00.000Z'
const ARRIVED_MS = Date.parse(ARRIVED)
const MINUTE = 60_000

function type(minutes: number | null | undefined): DriverOccurrenceType {
  return {
    id: 'wait',
    name: 'Espera longa',
    ...(minutes === undefined ? {} : { minWaitAfterArrivalMinutes: minutes }),
  }
}

function entry(state: RouteOccurrenceEntry['state']): RouteOccurrenceEntry {
  return { state, typeId: 'wait' } as RouteOccurrenceEntry
}

const base = { arrivedAt: ARRIVED, isArrivalRecorded: true, openEntries: [] }

describe('disponibilidade da ocorrência com espera mínima (spec 315 T7b)', () => {
  test('tipo sem espera mínima está sempre disponível', () => {
    for (const minutes of [undefined, null]) {
      expect(
        resolveOccurrenceAvailability({
          ...base,
          arrivedAt: null,
          isArrivalRecorded: false,
          nowMs: ARRIVED_MS,
          type: type(minutes),
        }).status,
      ).toBe('available')
    }
  })

  test('sem "Cheguei" fica bloqueado; com chegada ainda na fila, aguarda sincronizar', () => {
    const input = { ...base, arrivedAt: null, nowMs: ARRIVED_MS, type: type(30) }
    expect(resolveOccurrenceAvailability({ ...input, isArrivalRecorded: false }).status).toBe(
      'needsArrival',
    )
    expect(resolveOccurrenceAvailability({ ...input, isArrivalRecorded: true }).status).toBe(
      'arrivalSyncing',
    )
  })

  test('antes do prazo diz quanto falta (arredonda para cima) e abre no minuto exato', () => {
    const waiting = resolveOccurrenceAvailability({
      ...base,
      nowMs: ARRIVED_MS + 17 * MINUTE + 1,
      type: type(30),
    })
    expect(waiting).toEqual({
      availableAtMs: ARRIVED_MS + 30 * MINUTE,
      remainingMinutes: 13,
      status: 'waiting',
    })
    expect(
      resolveOccurrenceAvailability({ ...base, nowMs: ARRIVED_MS + 30 * MINUTE, type: type(30) })
        .status,
    ).toBe('available')
  })

  test('ocorrência viva do mesmo tipo na parada (escritório ou fila) não deixa abrir outra', () => {
    const input = { ...base, nowMs: ARRIVED_MS + 60 * MINUTE, type: type(30) }
    for (const state of ['open', 'queued'] as const) {
      expect(resolveOccurrenceAvailability({ ...input, openEntries: [entry(state)] }).status).toBe(
        'alreadyOpen',
      )
    }
    for (const state of ['resolved', 'cancelled', 'rejected'] as const) {
      expect(resolveOccurrenceAvailability({ ...input, openEntries: [entry(state)] }).status).toBe(
        'available',
      )
    }
  })

  test('o guard do catálogo tolera a espera ausente ou nula e recusa valor torto', () => {
    expect(isDriverOccurrenceType(type(undefined))).toBe(true)
    expect(isDriverOccurrenceType(type(null))).toBe(true)
    expect(isDriverOccurrenceType(type(30))).toBe(true)
    expect(isDriverOccurrenceType({ ...type(30), minWaitAfterArrivalMinutes: '30' })).toBe(false)
  })
})

describe('a ocorrência de parada espera o ponto antes de sair da fila (spec 315, recusa "exige a localização")', () => {
  const item = (createdAt: string, location: null | object): QueuedReport =>
    ({
      attempts: 0,
      createdAt,
      report: { kind: 'occurrence', location },
    }) as unknown as QueuedReport
  const at = (ms: number) => new Date(Date.parse(ARRIVED) + ms)

  test('segura a drenagem enquanto a leitura do GPS pode estar em curso', () => {
    expect(isAwaitingTapLocation({ item: item(ARRIVED, null), now: at(2_000) })).toBe(true)
  })

  test('passado o prazo da leitura, sai como está (GPS desligado de verdade)', () => {
    expect(isAwaitingTapLocation({ item: item(ARRIVED, null), now: at(11_000) })).toBe(false)
  })

  test('com ponto já gravado, ou de outro tipo, não espera', () => {
    expect(isAwaitingTapLocation({ item: item(ARRIVED, { latitude: 1 }), now: at(1_000) })).toBe(
      false,
    )
    const deliver = { attempts: 0, createdAt: ARRIVED, report: { kind: 'deliver' } }
    expect(
      isAwaitingTapLocation({ item: deliver as unknown as QueuedReport, now: at(1_000) }),
    ).toBe(false)
  })
})

describe('a foto da ocorrência de parada leva o ponto do toque (recusa "exige a localização" com GPS ligado)', () => {
  const photo = {
    description: 'x',
    documentId: null,
    idempotencyKey: 'k-photo',
    kind: 'stopOccurrencePhoto',
    occurrenceKey: 'k-occ',
    stopId: 's1',
  } as unknown as QueuedReport['report']

  test('entra nas chaves que a leitura do GPS completa', () => {
    expect(listLocatedReportKeys([{ ...photo, location: null } as never])).toEqual(['k-photo'])
  })

  test('item gravado antes do campo sai com location null, nunca sem a chave', () => {
    expect(withLegacyLocation(photo)).toMatchObject({ location: null })
  })

  test('espera o ponto como a ocorrência', () => {
    const item = {
      attempts: 0,
      createdAt: ARRIVED,
      report: { ...photo, location: null },
    } as unknown as QueuedReport
    expect(isAwaitingTapLocation({ item, now: new Date(Date.parse(ARRIVED) + 2_000) })).toBe(true)
  })
})

describe('a fila mostra de qual parada é cada ocorrência e segura o toque sem ponto', () => {
  test('o item da ocorrência de parada, da foto e da cobrança leva a parada para a linha de referência', () => {
    const queued = ['occurrence', 'stopOccurrencePhoto', 'stopOccurrenceCharge'].map(
      (kind, index) =>
        ({
          attempts: 0,
          createdAt: ARRIVED,
          report: { idempotencyKey: `k${index}`, kind, location: null, photos: [], stopId: 's1' },
        }) as unknown as QueuedReport,
    )
    const view = buildEventQueueView({ attachments: [], queued })
    expect(view.map((item) => item.stopId)).toEqual(['s1', 's1', 's1'])
  })
})
