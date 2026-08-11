/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import type { CteEmissionPreview } from '../../src/modules/nfe-workspace/shared/cteEmission.service.js'
import {
  chunkEmissionSelection,
  CTE_EMISSION_CHUNK_SIZE,
  mergeEmissionPreviews,
  resolveEmissionProgress,
  runEmissionQueue,
  type CteEmissionChunk,
  type CteEmissionProgressEvent,
} from '../../src/modules/nfe-workspace/shared/cteEmissionQueue.service.js'

function documentIds(count: number): readonly string[] {
  return Array.from({ length: count }, (_unused, index) => `document-${index + 1}`)
}

function previewFixture(
  input: Readonly<{ documentCount: number; totalAmount: string }>,
): CteEmissionPreview {
  return {
    blocked: [],
    projections: Array.from({ length: input.documentCount }, (_unused, index) => ({
      baseAmount: '10000.0000',
      documents: [
        {
          accessKey: '35260700000000000000550010000000011000000010',
          documentId: `document-${index + 1}`,
          number: String(index + 1),
          series: '1',
          totalAmount: '10000.0000',
        },
      ],
      fiscalAmount: '450.00',
      fiscalComponents: [
        { amount: '450.0000', calculationType: 'percentage_of_cargo', label: 'Frete' },
      ],
      percentage: '0.045000',
      profile: {
        groupingMode: 'per_invoice' as const,
        id: 'profile-1',
        matchedBy: 'sender_tax_id',
        name: 'Spani',
        resolvedBy: 'auto' as const,
      },
      recipientTaxId: '19354980000230',
      senderTaxId: '05868574001090',
    })),
    suggestedName: 'CT-e 2026-08-11',
    summary: {
      blockedCount: 0,
      documentCount: input.documentCount,
      projectedCount: input.documentCount,
      totalAmount: input.totalAmount,
    },
  }
}

describe('CT-e mass emission queue contract', () => {
  test('slices a per-invoice selection far beyond the per-request ceiling', () => {
    const chunks = chunkEmissionSelection({
      documentIds: documentIds(4501),
      groupingMode: 'per_invoice',
    })

    expect(chunks).toHaveLength(Math.ceil(4501 / CTE_EMISSION_CHUNK_SIZE))
    expect(chunks[0]?.documentIds).toHaveLength(CTE_EMISSION_CHUNK_SIZE)
    expect(chunks.at(-1)?.documentIds).toHaveLength(4501 % CTE_EMISSION_CHUNK_SIZE)
    expect(chunks.flatMap((chunk) => chunk.documentIds)).toHaveLength(4501)
    expect(chunks.map((chunk) => chunk.index)).toEqual(chunks.map((_unused, index) => index))
  })

  test('slices a sender/recipient selection without ever splitting a pair', () => {
    const selection = documentIds(4501)
    const groupKeyByDocumentId = new Map(
      selection.map((documentId, index) => [documentId, `pair-${Math.floor(index / 3)}`]),
    )

    const chunks = chunkEmissionSelection({
      documentIds: selection,
      groupKeyByDocumentId,
      groupingMode: 'sender_recipient',
    })
    const chunkIndexesByPair = new Map<string, Set<number>>()
    for (const chunk of chunks) {
      for (const documentId of chunk.documentIds) {
        const pair = groupKeyByDocumentId.get(documentId) ?? ''
        chunkIndexesByPair.set(pair, (chunkIndexesByPair.get(pair) ?? new Set()).add(chunk.index))
      }
    }

    expect(chunks.flatMap((chunk) => chunk.documentIds)).toHaveLength(4501)
    expect(chunks.length).toBeGreaterThan(1)
    expect([...chunkIndexesByPair.values()].every((indexes) => indexes.size === 1)).toBe(true)
    expect(chunks.every((chunk) => chunk.documentIds.length <= CTE_EMISSION_CHUNK_SIZE)).toBe(true)
  })

  /** Fatiar por tamanho fixo cortaria o par no meio; o par manda, mesmo maior que a fatia. */
  test('keeps a pair whole even when it alone outgrows the slice size', () => {
    const chunks = chunkEmissionSelection({
      documentIds: ['a', 'b', 'c', 'd', 'e'],
      groupKeyByDocumentId: new Map([
        ['a', 'pair-1'],
        ['b', 'pair-1'],
        ['c', 'pair-1'],
        ['d', 'pair-2'],
        ['e', 'pair-2'],
      ]),
      groupingMode: 'sender_recipient',
      size: 2,
    })

    expect(chunks).toEqual([
      { documentIds: ['a', 'b', 'c'], index: 0 },
      { documentIds: ['d', 'e'], index: 1 },
    ])
  })

  /** Sem o mapa de pares não dá para provar que a fatia não corta um par: vai tudo numa requisição. */
  test('falls back to a single slice when the pairs of the selection are unknown', () => {
    const chunks = chunkEmissionSelection({
      documentIds: documentIds(450),
      groupingMode: 'sender_recipient',
      size: 100,
    })

    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.documentIds).toHaveLength(450)
  })

  test('drops duplicates and returns nothing for an empty selection', () => {
    expect(
      chunkEmissionSelection({
        documentIds: ['a', 'b', 'a'],
        groupingMode: 'per_invoice',
        size: 10,
      }),
    ).toEqual([{ documentIds: ['a', 'b'], index: 0 }])
    expect(chunkEmissionSelection({ documentIds: [], groupingMode: 'per_invoice' })).toEqual([])
  })

  test('runs slices with bounded concurrency and reports progress as each one lands', async () => {
    const chunks: readonly CteEmissionChunk[] = chunkEmissionSelection({
      documentIds: documentIds(10),
      groupingMode: 'per_invoice',
      size: 1,
    })
    const events: CteEmissionProgressEvent[] = []
    let inFlight = 0
    let peakInFlight = 0

    const results = await runEmissionQueue({
      chunks,
      concurrency: 2,
      onProgress: (event) => events.push(event),
      run: async (chunk) => {
        inFlight += 1
        peakInFlight = Math.max(peakInFlight, inFlight)
        await Promise.resolve()
        inFlight -= 1
        return `batch-${chunk.index}`
      },
    })

    expect(peakInFlight).toBeLessThanOrEqual(2)
    expect(results.map((result) => result.value)).toEqual(
      chunks.map((chunk) => `batch-${chunk.index}`),
    )
    expect(results.every((result) => result.errorCode === null)).toBe(true)
    expect(events).toHaveLength(chunks.length)
    expect(events.at(-1)).toEqual({ completed: 10, errorCount: 0, total: 10 })
  })

  test('keeps sibling slices alive when one fails and records its error code', async () => {
    const chunks = chunkEmissionSelection({
      documentIds: documentIds(4),
      groupingMode: 'per_invoice',
      size: 1,
    })

    const results = await runEmissionQueue({
      chunks,
      concurrency: 2,
      run: (chunk) =>
        chunk.index === 1
          ? Promise.reject(new Error('CTE_BATCH_DOCUMENT_ALREADY_LINKED'))
          : Promise.resolve(`batch-${chunk.index}`),
    })

    expect(results.map((result) => result.errorCode)).toEqual([
      null,
      'CTE_BATCH_DOCUMENT_ALREADY_LINKED',
      null,
      null,
    ])
    expect(results[1]?.value).toBeNull()
    expect(results.filter((result) => result.value !== null)).toHaveLength(3)
  })

  test('resolves a determinate progress percentage', () => {
    expect(resolveEmissionProgress({ completed: 0, errorCount: 0, total: 0 })).toMatchObject({
      isComplete: false,
      percent: 0,
    })
    expect(resolveEmissionProgress({ completed: 3, errorCount: 1, total: 12 })).toMatchObject({
      errorCount: 1,
      isComplete: false,
      percent: 25,
    })
    expect(resolveEmissionProgress({ completed: 12, errorCount: 0, total: 12 })).toMatchObject({
      isComplete: true,
      percent: 100,
    })
  })

  test('merges slice projections and sums the total without binary float', () => {
    const merged = mergeEmissionPreviews([
      previewFixture({ documentCount: 2, totalAmount: '0.1000' }),
      previewFixture({ documentCount: 3, totalAmount: '0.2000' }),
    ])

    expect(merged?.projections).toHaveLength(5)
    expect(merged?.summary.projectedCount).toBe(5)
    expect(merged?.summary.documentCount).toBe(5)
    expect(merged?.summary.totalAmount).toBe('0.3000')
    expect(mergeEmissionPreviews([])).toBeNull()
  })
})
