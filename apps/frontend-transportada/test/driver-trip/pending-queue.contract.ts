/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { QueuedAttachment } from '@/modules/driver-trip/shared/offlineAttachments.service'
import type { QueuedReport } from '@/modules/driver-trip/shared/offlineQueue.service'
import { countPending } from '@/modules/driver-trip/shared/pendingQueue.service'

const NOW = new Date('2026-09-25T12:00:00.000Z')
const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000

/**
 * A definição vive na app do motorista e é **copiada por valor** para cá (ADR-0075 §7, no sentido
 * inverso). O caminho relativo entre apps é lido como texto, num teste — não é `import` de código,
 * que é o que a arquitetura proíbe.
 */
const DRIVER_APP_SOURCE = new URL(
  '../../../frontend-driver/src/modules/driver-trip/shared/pendingQueue.service.ts',
  import.meta.url,
)
const PANEL_SOURCE = new URL(
  '../../src/modules/driver-trip/shared/pendingQueue.service.ts',
  import.meta.url,
)

/** Do tipo `PendingCounts` até o fim de `countPending`: é a definição, sem os gatilhos da drenagem. */
function extractDefinition(source: string): string {
  const start = source.indexOf('export type PendingCounts')
  const functionStart = source.indexOf('export function countPending')
  const end = source.indexOf('\n}\n', functionStart)
  if (start === -1 || functionStart === -1 || end === -1) {
    throw new Error('PENDING_QUEUE_DEFINITION_NOT_FOUND')
  }
  return source.slice(start, end + 2)
}

function report(input: { key: string; rejectionCause?: string }): QueuedReport {
  return {
    attempts: 0,
    createdAt: NOW.toISOString(),
    ...(input.rejectionCause === undefined ? {} : { rejectionCause: input.rejectionCause }),
    report: { idempotencyKey: input.key, kind: 'arrive', location: null, stopId: 'stop-1' },
  }
}

function attachment(input: {
  capturedAt?: string
  key: string
  rejectionCause?: string
}): QueuedAttachment {
  return {
    attachmentKey: input.key,
    blob: new Blob(['x']),
    capturedAt: input.capturedAt ?? NOW.toISOString(),
    documentId: 'document-1',
    fileName: 'foto.jpg',
    kind: 'photo',
    ...(input.rejectionCause === undefined ? {} : { rejectionCause: input.rejectionCause }),
  }
}

/**
 * ADR-0075 §6: pendência é **uma** definição — eventos não recusados, mais anexos no prazo de 7
 * dias, mais recusados ainda não descartados. O painel usa `total` para decidir se o motorista
 * pode ir para a casa nova.
 */
describe('a pendência da fila antiga', () => {
  it('soma eventos e anexos não recusados e no prazo em drainable', () => {
    expect(
      countPending({
        attachments: [['chave-1', [attachment({ key: 'anexo-1' })]]],
        now: NOW,
        reports: [report({ key: 'chave-1' }), report({ key: 'chave-2' })],
      }),
    ).toEqual({ drainable: 3, rejected: 0, total: 3 })
  })

  it('recusado conta em rejected, e total é a soma', () => {
    expect(
      countPending({
        attachments: [['chave-1', [attachment({ key: 'anexo-1', rejectionCause: '422 X' })]]],
        now: NOW,
        reports: [report({ key: 'chave-1', rejectionCause: '409 X' }), report({ key: 'chave-2' })],
      }),
    ).toEqual({ drainable: 1, rejected: 2, total: 3 })
  })

  it('anexo vencido não segura o motorista no painel', () => {
    const stale = new Date(NOW.getTime() - EIGHT_DAYS_MS).toISOString()

    expect(
      countPending({
        attachments: [['document:document-1', [attachment({ capturedAt: stale, key: 'a' })]]],
        now: NOW,
        reports: [],
      }),
    ).toEqual({ drainable: 0, rejected: 0, total: 0 })
  })

  it('fila vazia é zero', () => {
    expect(countPending({ attachments: [], now: NOW, reports: [] })).toEqual({
      drainable: 0,
      rejected: 0,
      total: 0,
    })
  })

  /**
   * ⚠️ Duas cópias de uma regra divergem caladas: o painel diria "fila vazia" para o que a app
   * nova ainda contaria, e o motorista iria embora deixando entrega para trás. A paridade é lida do
   * texto das duas fontes.
   */
  it('é a mesma definição da app do motorista, pelo texto de fonte', async () => {
    const [driverApp, panel] = await Promise.all([
      Bun.file(DRIVER_APP_SOURCE).text(),
      Bun.file(PANEL_SOURCE).text(),
    ])

    expect(extractDefinition(panel)).toBe(extractDefinition(driverApp))
  })

  it('a cópia declara de onde veio', async () => {
    const panel = await Bun.file(PANEL_SOURCE).text()

    expect(panel).toContain(
      'Cópia por valor de apps/frontend-driver/src/modules/driver-trip/shared/pendingQueue.service.ts (ADR-0075 §7)',
    )
  })
})
