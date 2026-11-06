/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { CHECK_BATCH_WINDOW_MS } from '../../src/modules/nfe-access-key-lookup/shared/accessKeyLookup.constant'
import { createAccessKeyLookupQueue } from '../../src/modules/nfe-access-key-lookup/shared/accessKeyLookupQueue.service'
import {
  filterAccessKeyImportRows,
  summarizeAccessKeyImport,
} from '../../src/modules/nfe-workspace/shared/accessKeyImportSummary.service'
import {
  createFakeClient,
  createFakeScheduler,
  view,
} from '../nfe-access-key-lookup/lookup.fixture'

function keyAt(index: number): string {
  return `3526${String(index).padStart(2, '0')}${'1'.repeat(36)}`
}

function partition(summary: ReturnType<typeof summarizeAccessKeyImport>): number {
  return (
    summary.imported + summary.searching + summary.waiting + summary.refused + summary.notObtained
  )
}

describe('importar por bip: contrato do critério 4a', () => {
  it('50 leituras: bipadas 49, já estavam 30, ilegível 1, desconhecidas sempre repartidas em 18', async () => {
    const client = createFakeClient()
    const scheduler = createFakeScheduler()
    const queue = createAccessKeyLookupQueue({ client, scheduler })
    const registered = Array.from({ length: 30 }, (_, index) => keyAt(index))
    const unknown = Array.from({ length: 18 }, (_, index) => keyAt(30 + index))
    registered.forEach((key, index) => client.documents.set(key, `doc-${index}`))
    unknown.forEach((key, index) => {
      const lookupId = `lookup-${index}`
      client.requestResponses.set(key, () =>
        Promise.resolve({
          kind: 'lookup',
          lookup: view({
            id: lookupId,
            status: index < 6 ? 'queued' : 'waiting',
            notBefore: '2026-11-06T18:30:00Z',
          }),
        }),
      )
      client.getResponses.set(lookupId, () =>
        Promise.resolve(
          index < 6
            ? view({ documentId: `new-${index}`, id: lookupId, status: 'imported' })
            : index < 9
              ? view({ id: lookupId, reason: 'not_found', status: 'refused' })
              : view({ id: lookupId, notBefore: '2026-11-06T18:30:00Z', status: 'waiting' }),
        ),
      )
    })
    let unreadable = 0
    const unknownCount = (): number => {
      const summary = summarizeAccessKeyImport(queue.getRows(), unreadable)
      return partition(summary)
    }
    const checkEveryStep = (): void => {
      const summary = summarizeAccessKeyImport(queue.getRows(), unreadable)
      expect(partition(summary)).toBe(
        summary.scanned - summary.unreadable - summary.alreadyInSystem,
      )
    }

    const reads = [...registered, ...unknown]
    const repeated = reads[0] as string
    for (const [index, key] of reads.entries()) {
      queue.add(key)
      checkEveryStep()
      if (index === 10) expect(queue.add(repeated).alreadyScanned).toBe(true)
      if (index === 20) unreadable += 1
      if (index % 7 === 0) await scheduler.advance(CHECK_BATCH_WINDOW_MS)
    }
    for (let step = 0; step < 12; step += 1) {
      await scheduler.advance(CHECK_BATCH_WINDOW_MS)
      checkEveryStep()
    }
    await scheduler.advance(10_000)

    const summary = summarizeAccessKeyImport(queue.getRows(), unreadable)
    expect(summary.scanned).toBe(49)
    expect(summary.alreadyInSystem).toBe(30)
    expect(summary.unreadable).toBe(1)
    expect(partition(summary)).toBe(18)
    expect(summary.imported).toBe(6)
    expect(summary.refused).toBe(3)
    expect(summary.refusedByReason).toEqual({ not_found: 3 })
    expect(summary.waiting).toBe(9)
    expect(summary.nextWindowAt).toBe('2026-11-06T18:30:00Z')
    expect(filterAccessKeyImportRows(queue.getRows(), 'alreadyInSystem')).toHaveLength(30)
    expect(filterAccessKeyImportRows(queue.getRows(), 'imported')).toHaveLength(6)
    expect(filterAccessKeyImportRows(queue.getRows(), 'refused')).toHaveLength(3)
    expect(unknownCount()).toBe(18)
  })

  it('cada rajada de 500 ms faz uma chamada de conferência só', async () => {
    const client = createFakeClient()
    const scheduler = createFakeScheduler()
    const queue = createAccessKeyLookupQueue({ client, scheduler })
    for (let index = 0; index < 20; index += 1) {
      queue.add(keyAt(index))
      await scheduler.advance(20)
    }
    await scheduler.advance(CHECK_BATCH_WINDOW_MS)

    expect(client.calls.checks).toHaveLength(1)
    expect(client.calls.checks[0]).toHaveLength(20)
  })

  it('restaurar a lista guardada retoma a busca e limpar não apaga nada no servidor', async () => {
    const client = createFakeClient()
    const scheduler = createFakeScheduler()
    const queue = createAccessKeyLookupQueue({ client, scheduler })
    client.documents.set(keyAt(1), 'doc-1')
    queue.restore([
      { accessKey: keyAt(1), lookupId: null, wasRegistered: true },
      { accessKey: keyAt(2), lookupId: 'lookup-2', wasRegistered: false },
    ])
    client.getResponses.set('lookup-2', () =>
      Promise.resolve(view({ documentId: 'new-2', id: 'lookup-2', status: 'imported' })),
    )
    await scheduler.advance(10_000)

    const summary = summarizeAccessKeyImport(queue.getRows(), 0)
    expect([summary.alreadyInSystem, summary.imported]).toEqual([1, 1])

    queue.clear()
    expect(queue.getRows()).toEqual([])
    expect(scheduler.pendingCount()).toBe(0)
  })
})
