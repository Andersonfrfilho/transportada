/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { DriverRouteOccurrence } from '@/modules/driver-trip/shared/driverRouteOccurrence.types'
import type { QueuedReport } from '@/modules/driver-trip/shared/offlineQueue.service'
import {
  buildRouteOccurrenceEntries,
  countOpenRouteOccurrences,
  countRouteOccurrencesByFilter,
  filterRouteOccurrences,
  groupRouteOccurrences,
  groupRouteOccurrencesByStop,
  listSiblingRouteOccurrences,
} from '@/modules/driver-trip/shared/routeOccurrenceView.service'
import type {
  RouteOccurrenceEntry,
  RouteOccurrenceStopReference,
} from '@/modules/driver-trip/shared/routeOccurrenceView.types'

const STOPS: readonly RouteOccurrenceStopReference[] = [
  {
    documents: [
      { id: 'doc-1', number: '1001' },
      { id: 'doc-2', number: '1002' },
    ],
    id: 'stop-1',
    sequence: 1,
  },
  { documents: [{ id: 'doc-3', number: '1003' }], id: 'stop-2', sequence: 2 },
]

function at(minutes: number): string {
  return new Date(Date.UTC(2026, 9, 15, 10, minutes)).toISOString()
}

function serverOccurrence(overrides: Partial<DriverRouteOccurrence> = {}): DriverRouteOccurrence {
  return {
    conversationExists: false,
    documentCount: 0,
    documentId: 'doc-1',
    documentNumber: '1001',
    id: 'occ-1',
    kind: 'document',
    recordedAt: at(0),
    recordedByMe: true,
    reopenedAt: null,
    resolution: null,
    state: 'open',
    stopId: 'stop-1',
    stopSequence: 1,
    type: { iconName: null, id: 'type-1', name: 'Avaria' },
    ...overrides,
  }
}

function queuedDocumentOccurrence(
  input: {
    key?: string
    minutes?: number
    documentId?: string
    typeId?: string
    cause?: string
  } = {},
): QueuedReport {
  return {
    attempts: 0,
    createdAt: at(input.minutes ?? 0),
    ...(input.cause === undefined ? {} : { rejectionCause: input.cause }),
    report: {
      documentId: input.documentId ?? 'doc-1',
      idempotencyKey: input.key ?? 'key-1',
      kind: 'documentOccurrence',
      location: null,
      note: '',
      occurrenceTypeId: input.typeId ?? 'type-1',
      occurrenceTypeName: 'Avaria',
      photo: null,
      productCode: '',
    },
  }
}

function queuedStopOccurrence(input: {
  key: string
  minutes: number
  stopId?: string
}): QueuedReport {
  return {
    attempts: 0,
    createdAt: at(input.minutes),
    report: {
      description: 'Rua fechada',
      documentId: null,
      idempotencyKey: input.key,
      kind: 'occurrence',
      location: null,
      occurrenceTypeId: 'type-stop',
      stopId: input.stopId ?? 'stop-1',
    },
  }
}

function build(input: {
  queued?: readonly QueuedReport[]
  server?: readonly DriverRouteOccurrence[]
  unread?: ReadonlyMap<string, number>
}): readonly RouteOccurrenceEntry[] {
  return buildRouteOccurrenceEntries({
    queuedReports: input.queued ?? [],
    serverOccurrences: input.server ?? [],
    stops: STOPS,
    unreadByOccurrenceId: input.unread ?? new Map(),
  })
}

describe('junção do servidor com a fila (spec 266 T4.3)', () => {
  it('item da fila vira queued, com parada e número da nota resolvidos', () => {
    const [entry] = build({ queued: [queuedDocumentOccurrence()] })
    expect(entry).toMatchObject({
      documentId: 'doc-1',
      documentNumber: '1001',
      id: 'key-1',
      kind: 'document',
      source: 'queue',
      state: 'queued',
      stopId: 'stop-1',
      stopSequence: 1,
      typeId: 'type-1',
    })
  })

  it('item recusado vira rejected com a causa', () => {
    const [entry] = build({ queued: [queuedDocumentOccurrence({ cause: '422 TYPE_INACTIVE' })] })
    expect(entry).toMatchObject({ rejectionCause: '422 TYPE_INACTIVE', state: 'rejected' })
  })

  it('ocorrência de parada da fila: sem nota, kind stop', () => {
    const [entry] = build({ queued: [queuedStopOccurrence({ key: 'k', minutes: 0 })] })
    expect(entry).toMatchObject({ documentId: null, kind: 'stop', stopId: 'stop-1' })
  })

  it('ignora o que da fila não é ocorrência', () => {
    const arrive: QueuedReport = {
      attempts: 0,
      createdAt: at(0),
      report: { idempotencyKey: 'a', kind: 'arrive', location: null, stopId: 'stop-1' },
    }
    expect(build({ queued: [arrive] })).toEqual([])
  })

  it('não duplica quando o servidor já tem a ocorrência (mesma nota, tipo e hora)', () => {
    const entries = build({
      queued: [queuedDocumentOccurrence({ minutes: 1 })],
      server: [serverOccurrence({ recordedAt: at(0) })],
    })
    expect(entries.map((entry) => entry.source)).toEqual(['server'])
  })

  it('o mesmo tipo duas vezes na nota: cada do servidor absorve só um da fila', () => {
    const entries = build({
      queued: [
        queuedDocumentOccurrence({ key: 'k1', minutes: 0 }),
        queuedDocumentOccurrence({ key: 'k2', minutes: 2 }),
      ],
      server: [serverOccurrence({ id: 'occ-1', recordedAt: at(0) })],
    })
    expect(entries.map((entry) => [entry.source, entry.id])).toEqual([
      ['server', 'occ-1'],
      ['queue', 'k2'],
    ])
  })

  it('hora longe, tipo ou nota diferentes não casam', () => {
    const server = serverOccurrence({ recordedAt: at(0) })
    expect(
      build({ queued: [queuedDocumentOccurrence({ minutes: 30 })], server: [server] }),
    ).toHaveLength(2)
    expect(
      build({ queued: [queuedDocumentOccurrence({ typeId: 'other' })], server: [server] }),
    ).toHaveLength(2)
    expect(
      build({ queued: [queuedDocumentOccurrence({ documentId: 'doc-2' })], server: [server] }),
    ).toHaveLength(2)
  })

  it('o recusado nunca é absorvido: o servidor o recusou', () => {
    const entries = build({
      queued: [queuedDocumentOccurrence({ cause: '422' })],
      server: [serverOccurrence()],
    })
    expect(entries.map((entry) => entry.state)).toEqual(['open', 'rejected'])
  })

  it('só absorve ocorrência que eu registrei', () => {
    const entries = build({
      queued: [queuedDocumentOccurrence()],
      server: [serverOccurrence({ recordedByMe: false })],
    })
    expect(entries).toHaveLength(2)
  })

  it('carrega não lidas, documento, conversa, reabertura e nota de resolução do servidor', () => {
    const [entry] = build({
      server: [
        serverOccurrence({
          conversationExists: true,
          documentCount: 1,
          reopenedAt: at(5),
          resolution: { actorKind: 'internal', at: at(4), note: 'Resolvido' },
          state: 'resolved',
        }),
      ],
      unread: new Map([['occ-1', 3]]),
    })
    expect(entry).toMatchObject({
      hasConversation: true,
      hasDocument: true,
      isReopened: true,
      resolutionNote: 'Resolvido',
      state: 'resolved',
      unreadCount: 3,
    })
  })
})

describe('contagem, grupos e filtros (spec 266 T4.3)', () => {
  const entries = build({
    queued: [
      queuedDocumentOccurrence({ key: 'q', minutes: 10 }),
      queuedDocumentOccurrence({ cause: '422', documentId: 'doc-3', key: 'r', minutes: 20 }),
    ],
    server: [
      serverOccurrence({
        conversationExists: true,
        documentCount: 1,
        id: 'a',
        recordedAt: at(-60),
      }),
      serverOccurrence({ id: 'b', recordedAt: at(-50), state: 'resolved' }),
      serverOccurrence({ id: 'c', recordedAt: at(-40), state: 'cancelled' }),
    ],
    unread: new Map([['a', 2]]),
  })

  it('o alerta conta fila, recusadas e abertas — resolvidas e canceladas não', () => {
    expect(countOpenRouteOccurrences(entries)).toBe(3)
  })

  it('abertas primeiro, as resolvidas e canceladas embaixo, mais novas antes', () => {
    const groups = groupRouteOccurrences(entries)
    expect(groups.open.map((entry) => entry.id)).toEqual(['r', 'q', 'a'])
    expect(groups.closed.map((entry) => entry.id)).toEqual(['c', 'b'])
  })

  it('filtros: todas, não lidas, documentos, recusadas, na fila', () => {
    const ids = (filter: Parameters<typeof filterRouteOccurrences>[0]['filter']) =>
      filterRouteOccurrences({ entries, filter }).map((entry) => entry.id)
    expect(ids('all')).toHaveLength(5)
    expect(ids('unread')).toEqual(['a'])
    expect(ids('documents')).toEqual(['a'])
    expect(ids('refused')).toEqual(['r'])
    expect(ids('queued')).toEqual(['q'])
  })

  it('a contagem de cada filtro bate com o filtro', () => {
    expect(countRouteOccurrencesByFilter(entries)).toEqual({
      all: 5,
      documents: 1,
      queued: 1,
      refused: 1,
      unread: 1,
    })
  })
})

describe('por parada e por nota (spec 266 T4.3)', () => {
  function onNote(count: number): readonly RouteOccurrenceEntry[] {
    return build({
      server: Array.from({ length: count }, (_, index) =>
        serverOccurrence({ id: `n${index}`, recordedAt: at(index) }),
      ),
    })
  }

  it('paradas por sequência, notas por registro, as de parada em grupo próprio', () => {
    const entries = build({
      server: [
        serverOccurrence({ id: 'late', recordedAt: at(9) }),
        serverOccurrence({
          documentId: 'doc-2',
          documentNumber: '1002',
          id: 'doc2',
          recordedAt: at(3),
        }),
        serverOccurrence({
          documentId: null,
          documentNumber: null,
          id: 'stopLevel',
          kind: 'stop',
          recordedAt: at(5),
        }),
        serverOccurrence({
          documentId: 'doc-3',
          documentNumber: '1003',
          id: 'other',
          recordedAt: at(1),
          stopId: 'stop-2',
          stopSequence: 2,
        }),
        serverOccurrence({ id: 'early', recordedAt: at(1) }),
      ],
    })
    const stops = groupRouteOccurrencesByStop(entries)
    expect(stops.map((stop) => stop.stopId)).toEqual(['stop-1', 'stop-2'])
    const first = stops[0]
    expect(
      first?.noteGroups.map((group) => [group.documentNumber, group.entries.map((e) => e.id)]),
    ).toEqual([
      ['1001', ['early', 'late']],
      ['1002', ['doc2']],
    ])
    expect(first?.stopLevel?.entries.map((entry) => entry.id)).toEqual(['stopLevel'])
    expect(stops[1]?.stopLevel).toBeUndefined()
  })

  it('o mesmo tipo duas vezes na nota são dois ícones', () => {
    const group = groupRouteOccurrencesByStop(onNote(2))[0]?.noteGroups[0]
    expect(group?.visible).toHaveLength(2)
    expect(group?.moreCount).toBe(0)
  })

  it('até 4 ícones mostra todos; acima disso, 3 e "+N"', () => {
    const four = groupRouteOccurrencesByStop(onNote(4))[0]?.noteGroups[0]
    expect([four?.visible.length, four?.moreCount]).toEqual([4, 0])
    const six = groupRouteOccurrencesByStop(onNote(6))[0]?.noteGroups[0]
    expect([six?.visible.map((e) => e.id), six?.moreCount, six?.entries.length]).toEqual([
      ['n0', 'n1', 'n2'],
      3,
      6,
    ])
  })

  it('irmãs: as da mesma nota primeiro, depois as demais da parada; nunca a própria nem de outra parada', () => {
    const entries = build({
      server: [
        serverOccurrence({ id: 'cur', recordedAt: at(0) }),
        serverOccurrence({ id: 'sameNote', recordedAt: at(2) }),
        serverOccurrence({
          documentId: 'doc-2',
          documentNumber: '1002',
          id: 'sameStop',
          recordedAt: at(1),
        }),
        serverOccurrence({ documentId: null, id: 'stopLevel', kind: 'stop', recordedAt: at(3) }),
        serverOccurrence({
          documentId: 'doc-3',
          id: 'elsewhere',
          stopId: 'stop-2',
          stopSequence: 2,
        }),
      ],
    })
    const current = entries.find((entry) => entry.id === 'cur') as RouteOccurrenceEntry
    const siblings = listSiblingRouteOccurrences({ current, entries })
    expect(siblings.sameNote.map((entry) => entry.id)).toEqual(['sameNote'])
    expect(siblings.sameStop.map((entry) => entry.id)).toEqual(['sameStop', 'stopLevel'])
  })

  it('ocorrência de parada: sem irmãs de nota, as demais da parada', () => {
    const entries = build({
      server: [
        serverOccurrence({ documentId: null, id: 'cur', kind: 'stop', recordedAt: at(0) }),
        serverOccurrence({ id: 'note', recordedAt: at(1) }),
      ],
    })
    const current = entries.find((entry) => entry.id === 'cur') as RouteOccurrenceEntry
    const siblings = listSiblingRouteOccurrences({ current, entries })
    expect(siblings.sameNote).toEqual([])
    expect(siblings.sameStop.map((entry) => entry.id)).toEqual(['note'])
  })
})
