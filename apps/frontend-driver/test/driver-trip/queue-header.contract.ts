/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { QueuedAttachment } from '@/modules/driver-trip/shared/offlineAttachments.service'
import type { QueuedReport } from '@/modules/driver-trip/shared/offlineQueue.service'
import {
  formatQueueBadge,
  selectPendingTotal,
} from '@/modules/driver-trip/shared/pendingQueue.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const NOW = new Date('2026-09-25T12:00:00.000Z')
const OWNER = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function report(input: { key: string; rejectionCause?: string; subHash: string }): QueuedReport {
  return {
    attempts: 0,
    createdAt: NOW.toISOString(),
    ...(input.rejectionCause === undefined ? {} : { rejectionCause: input.rejectionCause }),
    report: { idempotencyKey: input.key, kind: 'arrive', location: null, stopId: 'stop-1' },
    subHash: input.subHash,
  }
}

function attachment(input: { key: string; subHash: string }): QueuedAttachment {
  return {
    attachmentKey: input.key,
    blob: new Blob(['x']),
    capturedAt: NOW.toISOString(),
    documentId: 'document-1',
    fileName: 'foto.jpg',
    kind: 'photo',
    subHash: input.subHash,
  }
}

describe('a fila no cabeçalho: a contagem (spec 193 D13)', () => {
  it('selectPendingTotal soma o total do dono — drenável e recusado — e ignora outra conta', () => {
    const total = selectPendingTotal({
      attachments: [
        ['chave-1', [attachment({ key: 'anexo-1', subHash: OWNER })]],
        ['chave-9', [attachment({ key: 'anexo-9', subHash: OTHER })]],
      ],
      now: NOW,
      ownerSubHash: OWNER,
      reports: [
        report({ key: 'chave-1', subHash: OWNER }),
        report({ key: 'chave-2', rejectionCause: '409 CONFLICT', subHash: OWNER }),
        report({ key: 'chave-9', subHash: OTHER }),
      ],
    })

    expect(total).toBe(3)
  })

  it('fila vazia é zero', () => {
    expect(
      selectPendingTotal({ attachments: [], now: NOW, ownerSubHash: OWNER, reports: [] }),
    ).toBe(0)
  })

  it('formatQueueBadge: sem selo no zero, o número até 99 e "99+" acima', () => {
    expect(formatQueueBadge(0)).toBe('')
    expect(formatQueueBadge(7)).toBe('7')
    expect(formatQueueBadge(99)).toBe('99')
    expect(formatQueueBadge(100)).toBe('99+')
  })
})

describe('a fila no cabeçalho: o botão (spec 193 D13)', () => {
  const HEADER = 'src/modules/driver-trip/components/DriverShellHeader.component.tsx'
  const WORKSPACE = 'src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx'

  it('o botão da fila vem entre a marca e o sino, e abre /fila', async () => {
    const source = await readApplicationFile(HEADER)
    const queueAt = source.indexOf("navigateToDriverSection('queue')")
    const bellAt = source.indexOf('<NotificationBell')
    const brandAt = source.indexOf('<InstallationBrandMark')

    expect(queueAt).toBeGreaterThan(-1)
    expect(brandAt).toBeGreaterThan(-1)
    expect(queueAt).toBeGreaterThan(brandAt)
    expect(queueAt).toBeLessThan(bellAt)
  })

  it('o selo sai de formatQueueBadge e o nome acessível diz quantos pendentes', async () => {
    const source = await readApplicationFile(HEADER)

    expect(source).toContain('formatQueueBadge(pendingCount)')
    expect(source).toContain("t('queueHeader.label', { count: pendingCount })")
    expect(source).toContain('styles.queueButton')
  })

  it('toda montagem do cabeçalho no workspace passa a contagem do hook', async () => {
    const source = await readApplicationFile(WORKSPACE)
    const mounts = source.match(/<DriverShellHeader\b[^>]*\/>/g) ?? []

    expect(mounts.length).toBeGreaterThanOrEqual(6)
    for (const mount of mounts) {
      expect(mount).toContain('pendingCount={driverTrip.pendingTotal}')
    }
  })

  it('o hook expõe pendingTotal a partir de selectPendingTotal', async () => {
    const source = await readApplicationFile('src/modules/driver-trip/hooks/useDriverTrip.hook.ts')

    expect(source).toContain('selectPendingTotal({')
    expect(source).toContain('pendingTotal,')
  })

  it('o rótulo existe em pt-BR e en, no singular, no plural e no zero', async () => {
    const [portuguese, english] = await Promise.all([
      readApplicationFile('src/modules/driver-trip/locales/driverTrip.locale.json'),
      readApplicationFile('src/modules/driver-trip/locales/driverTrip.en.locale.json'),
    ])
    for (const locale of [portuguese, english]) {
      const queueHeader = (JSON.parse(locale) as { queueHeader?: Record<string, string> })
        .queueHeader
      expect(Object.keys(queueHeader ?? {}).sort()).toEqual([
        'label_one',
        'label_other',
        'label_zero',
      ])
    }
    expect(portuguese).toContain('"label_other": "Fila de envio, {{count}} pendentes"')
  })
})
