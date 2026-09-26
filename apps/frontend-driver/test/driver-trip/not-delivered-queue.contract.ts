/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { DriverFieldReport } from '../../src/modules/driver-trip/shared/driverTrip.types'
import {
  buildEventQueueView,
  type EventQueueItemView,
} from '../../src/modules/driver-trip/shared/eventQueueView.service'
import {
  findOccurrenceKey,
  resolveNotDeliveredStatus,
} from '../../src/modules/driver-trip/shared/notDelivered.service'
import {
  readCachedOccurrenceTypes,
  resolveOccurrenceTypesWithCache,
  saveCachedOccurrenceTypes,
  type OccurrenceTypesStorage,
} from '../../src/modules/driver-trip/shared/occurrenceTypesCache.service'
import {
  enqueueReports,
  sumReportPhotoBytes,
} from '../../src/modules/driver-trip/shared/offlineQueue.service'
import { createMemoryQueue } from '../fixtures/memory-queue-stores.fixture'

const NOW = new Date('2026-09-25T12:00:00.000Z')

function occurrence(key: string, bytes = 2048): DriverFieldReport {
  return {
    documentId: 'document-1',
    idempotencyKey: key,
    kind: 'documentOccurrence',
    note: '',
    occurrenceTypeId: 'type-1',
    occurrenceTypeName: 'Recusa total',
    photo: { blob: new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), fileName: 'a.jpg' },
    productCode: '',
  }
}

function returned(key: string): DriverFieldReport {
  return {
    documentId: 'document-1',
    idempotencyKey: key,
    kind: 'return',
    location: null,
    reason: 'recipient_refused',
  }
}

/**
 * Spec 179 T303 (RF5): a foto e a ocorrência entram na fila junto da devolução — todos ou nenhum,
 * numa transação só. Metade na fila deixaria a nota devolvida sem prova, ou a prova sem a devolução.
 */
describe('"Não entreguei" na fila offline (spec 179 T303)', () => {
  it('os itens do toque entram juntos, na ordem, com o dono', async () => {
    const store = createMemoryQueue()

    const result = await enqueueReports({
      now: NOW,
      reports: [occurrence('occurrence-key'), returned('return-key')],
      store,
      subHash: 'dono',
    })

    expect(result.accepted).toBe(true)
    expect(store.items().map((item) => item.report.idempotencyKey)).toEqual([
      'occurrence-key',
      'return-key',
    ])
    expect(store.items().every((item) => item.subHash === 'dono')).toBe(true)
  })

  it('sem vaga para os dois, nenhum entra — e a recusa é tipada', async () => {
    const store = createMemoryQueue()

    const result = await enqueueReports({
      limits: { maxCount: 1 },
      now: NOW,
      reports: [occurrence('occurrence-key'), returned('return-key')],
      store,
    })

    expect(result).toEqual({ accepted: false, reason: 'count-limit' })
    expect(store.items()).toEqual([])
  })

  it('o mesmo toque reenviado não entra duas vezes', async () => {
    const store = createMemoryQueue()
    const reports = [occurrence('occurrence-key'), returned('return-key')]

    await enqueueReports({ now: NOW, reports, store })
    await enqueueReports({ now: NOW, reports, store })

    expect(store.items()).toHaveLength(2)
  })

  it('sem sessão, os dois ficam esperando a confirmação do dono', async () => {
    const store = createMemoryQueue()

    await enqueueReports({
      isUnverified: true,
      now: NOW,
      reports: [occurrence('occurrence-key'), returned('return-key')],
      store,
    })

    expect(store.items().every((item) => item.isUnverified === true)).toBe(true)
  })

  /** A foto conta no mesmo teto de bytes dos anexos: é o mesmo aparelho e a mesma cota. */
  it('soma os bytes de foto que os itens carregam', () => {
    expect(sumReportPhotoBytes([occurrence('a', 1000), returned('b'), occurrence('c', 500)])).toBe(
      1500,
    )
    expect(sumReportPhotoBytes([{ ...occurrence('a'), photo: null } as DriverFieldReport])).toBe(0)
  })

  it('a tela de pendentes mostra a foto como anexo da ocorrência, com a nota', () => {
    const [view] = buildEventQueueView({
      attachments: [],
      queued: [{ attempts: 0, createdAt: NOW.toISOString(), report: occurrence('k') }],
    })

    expect(view).toMatchObject({
      attachmentCount: 1,
      documentId: 'document-1',
      kind: 'documentOccurrence',
    })
  })

  it('a chave acompanhada é a da ocorrência, não a da devolução', () => {
    expect(findOccurrenceKey([occurrence('occurrence-key'), returned('return-key')])).toBe(
      'occurrence-key',
    )
    expect(findOccurrenceKey([returned('return-key')])).toBeUndefined()
  })
})

function queueItem(overrides: Partial<EventQueueItemView> = {}): EventQueueItemView {
  return {
    attachmentCount: 1,
    documentId: 'document-1',
    idempotencyKey: 'occurrence-key',
    kind: 'documentOccurrence',
    queuedAt: NOW.toISOString(),
    status: { state: 'queued' },
    ...overrides,
  }
}

/** RF5/CA05: "na fila" nunca se passa por "enviado" — a tela diz o que está gravado. */
describe('"na fila" e "enviado" da ocorrência com foto (spec 179 RF5)', () => {
  const base = { documentId: 'document-1', occurrenceKey: 'occurrence-key' }

  it('na fila enquanto o item está lá, mesmo que a rede tenha falhado', () => {
    for (const status of [
      { state: 'queued' } as const,
      { attempts: 2, state: 'failed' } as const,
      { state: 'unverified' } as const,
    ]) {
      expect(
        resolveNotDeliveredStatus({
          ...base,
          queueView: [queueItem({ status })],
          sentReportKeys: new Set(),
        }),
      ).toBe('queued')
    }
  })

  it('recusado pelo servidor fica à vista como recusado', () => {
    expect(
      resolveNotDeliveredStatus({
        ...base,
        queueView: [queueItem({ status: { cause: '422 X', state: 'rejected' } })],
        sentReportKeys: new Set(),
      }),
    ).toBe('rejected')
  })

  it('enviado só quando a drenagem viu o servidor aceitar esta chave', () => {
    expect(
      resolveNotDeliveredStatus({
        ...base,
        queueView: [],
        sentReportKeys: new Set(['occurrence-key']),
      }),
    ).toBe('sent')
  })

  /** Descartado ("Sair", pendência de outra conta) não é enviado: sem prova, a tela não diz nada. */
  it('fora da fila sem aceite do servidor não vira enviado', () => {
    expect(
      resolveNotDeliveredStatus({ ...base, queueView: [], sentReportKeys: new Set() }),
    ).toBeUndefined()
  })

  /** Depois de recarregar a app, a chave do toque se perdeu — a fila ainda sabe a nota. */
  it('sem a chave do toque, acha o item da fila pela nota', () => {
    expect(
      resolveNotDeliveredStatus({
        documentId: 'document-1',
        occurrenceKey: undefined,
        queueView: [queueItem()],
        sentReportKeys: new Set(),
      }),
    ).toBe('queued')
  })
})

function memoryStorage(): OccurrenceTypesStorage & { readonly values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    values,
  }
}

/** P3: aberta sem sinal, a app ainda oferece os tipos — os últimos que o mesmo dono leu. */
describe('a última lista de tipos, para abrir sem sinal (spec 179 P3)', () => {
  const types = [{ attachmentMode: 'required' as const, id: 'a', name: 'Recusa total' }]

  it('guarda por dono e devolve a mesma lista', () => {
    const storage = memoryStorage()
    saveCachedOccurrenceTypes({ storage, subHash: 'dono', types })

    expect(readCachedOccurrenceTypes({ storage, subHash: 'dono' })).toEqual(types)
    expect(readCachedOccurrenceTypes({ storage, subHash: 'outra-conta' })).toBeUndefined()
  })

  it('conteúdo estranho no armazenamento não vira tipo', () => {
    const storage = memoryStorage()
    storage.setItem('transportada.driver.occurrence-types.v1:dono', '{"id":1}')

    expect(readCachedOccurrenceTypes({ storage, subHash: 'dono' })).toBeUndefined()
  })

  it('sem armazenamento (modo privado), nada quebra', () => {
    expect(readCachedOccurrenceTypes({ storage: null, subHash: 'dono' })).toBeUndefined()
    expect(() => saveCachedOccurrenceTypes({ storage: null, subHash: 'dono', types })).not.toThrow()
  })

  it('a resposta da API manda; a falha cai na cópia; sem cópia, a falha continua falha', () => {
    const fresh = [{ id: 'b', name: 'Destinatário ausente' }]

    expect(
      resolveOccurrenceTypesWithCache({
        cached: types,
        result: { status: 'loaded', types: fresh },
      }),
    ).toEqual({ status: 'loaded', types: fresh })
    expect(
      resolveOccurrenceTypesWithCache({ cached: types, result: { status: 'failed' } }),
    ).toEqual({ status: 'loaded', types })
    expect(
      resolveOccurrenceTypesWithCache({ cached: undefined, result: { status: 'failed' } }),
    ).toEqual({ status: 'failed' })
  })
})
