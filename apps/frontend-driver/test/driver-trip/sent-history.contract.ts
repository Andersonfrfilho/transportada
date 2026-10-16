/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { QueuedReport } from '@/modules/driver-trip/shared/offlineQueue.service'
import {
  appendSentHistory,
  purgeTripSentHistory,
  SENT_HISTORY_MAX_ENTRIES,
  SENT_HISTORY_RETENTION_MS,
  toProofSentHistoryEntry,
  toSentHistoryEntry,
  type SentHistoryEntry,
} from '@/modules/driver-trip/shared/sentHistory.service'

const NOW_MS = Date.parse('2026-10-15T21:00:00.000Z')

function entry(overrides: Partial<SentHistoryEntry> & { key: string }): SentHistoryEntry {
  return {
    at: '2026-10-15T20:00:00.000Z',
    kind: 'arrive',
    result: 'sent',
    tappedAt: '2026-10-15T19:59:50.000Z',
    ...overrides,
  }
}

const ARRIVE: QueuedReport = {
  attempts: 0,
  createdAt: '2026-10-15T17:49:22.000Z',
  report: { idempotencyKey: 'arrive-1', kind: 'arrive', location: null, stopId: 'stop-1' },
}

/**
 * Pedido do usuário (15/10): saber o que foi enviado e a que horas. Os cenários abaixo repetem o que
 * a tela `/fila` mostrou na pilha real: toque e envio com segundos, mais recente primeiro.
 */
describe('histórico de enviados (teste local de 15/10)', () => {
  it('guarda o toque e o desfecho, com a parada do evento e sem corpo nem foto', () => {
    expect(
      toSentHistoryEntry({ at: '2026-10-15T17:49:35.000Z', item: ARRIVE, result: 'sent' }),
    ).toEqual({
      at: '2026-10-15T17:49:35.000Z',
      key: 'arrive-1',
      kind: 'arrive',
      result: 'sent',
      stopId: 'stop-1',
      tappedAt: '2026-10-15T17:49:22.000Z',
    })
  })

  it('a recusa leva a causa; o envio não leva campo de causa', () => {
    const rejected = toSentHistoryEntry({
      at: '2026-10-15T17:50:00.000Z',
      cause: 'TRIP_STOP_NOT_FOUND',
      item: ARRIVE,
      result: 'rejected',
    })
    expect(rejected.cause).toBe('TRIP_STOP_NOT_FOUND')
    expect(
      'cause' in toSentHistoryEntry({ at: ARRIVE.createdAt, item: ARRIVE, result: 'sent' }),
    ).toBe(false)
  })

  it('a foto do canhoto que subiu entra com a hora da captura, não a do envio', () => {
    expect(
      toProofSentHistoryEntry({
        at: '2026-10-15T21:33:55.000Z',
        attachment: {
          attachmentKey: 'proof-1',
          capturedAt: '2026-10-15T21:24:46.000Z',
          documentId: 'doc-1',
        },
      }),
    ).toEqual({
      at: '2026-10-15T21:33:55.000Z',
      documentId: 'doc-1',
      key: 'proof-1',
      kind: 'proof',
      result: 'sent',
      tappedAt: '2026-10-15T21:24:46.000Z',
    })
  })

  it('o mais recente vem primeiro, mesmo quando a foto sobe depois da entrega', () => {
    const history = appendSentHistory({
      additions: [entry({ at: '2026-10-15T20:30:00.000Z', key: 'proof', kind: 'proof' })],
      current: [
        entry({ at: '2026-10-15T20:10:00.000Z', key: 'deliver', kind: 'deliver' }),
        entry({ at: '2026-10-15T20:00:00.000Z', key: 'arrive' }),
      ],
      nowMs: NOW_MS,
    })
    expect(history.map((item) => item.key)).toEqual(['proof', 'deliver', 'arrive'])
  })

  it('a recusa reenviada e aceita substitui a anterior em vez de duplicar', () => {
    const history = appendSentHistory({
      additions: [entry({ at: '2026-10-15T20:40:00.000Z', key: 'same', result: 'sent' })],
      current: [entry({ at: '2026-10-15T20:00:00.000Z', key: 'same', result: 'rejected' })],
      nowMs: NOW_MS,
    })
    expect(history).toHaveLength(1)
    expect(history[0]?.result).toBe('sent')
  })

  it('descarta o que passou do prazo e o que tem data inválida', () => {
    const expired = new Date(NOW_MS - SENT_HISTORY_RETENTION_MS - 1000).toISOString()
    const edge = new Date(NOW_MS - SENT_HISTORY_RETENTION_MS).toISOString()
    const history = appendSentHistory({
      additions: [],
      current: [
        entry({ at: expired, key: 'expired' }),
        entry({ at: edge, key: 'edge' }),
        entry({ at: 'not-a-date', key: 'invalid' }),
      ],
      nowMs: NOW_MS,
    })
    expect(history.map((item) => item.key)).toEqual(['edge'])
  })

  it('respeita o teto e mantém os mais recentes', () => {
    const current = Array.from({ length: SENT_HISTORY_MAX_ENTRIES + 5 }, (_, index) =>
      entry({ at: new Date(NOW_MS - (index + 1) * 1000).toISOString(), key: `k${index}` }),
    )
    const history = appendSentHistory({ additions: [], current, nowMs: NOW_MS })
    expect(history).toHaveLength(SENT_HISTORY_MAX_ENTRIES)
    expect(history[0]?.key).toBe('k0')
  })

  it('viagem concluída apaga os registros das paradas e notas dela e deixa o resto', () => {
    const history = purgeTripSentHistory({
      entries: [
        entry({ key: 'stop', stopId: 'stop-1' }),
        entry({ documentId: 'doc-1', key: 'doc', kind: 'deliver' }),
        entry({ key: 'dispatch', kind: 'dispatch' }),
        entry({ key: 'other-stop', stopId: 'stop-9' }),
      ],
      trip: { stops: [{ documents: [{ id: 'doc-1' }], id: 'stop-1' }] },
    })
    expect(history.map((item) => item.key)).toEqual(['dispatch', 'other-stop'])
  })
})
