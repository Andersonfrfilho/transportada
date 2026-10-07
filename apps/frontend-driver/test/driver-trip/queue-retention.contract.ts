/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import * as attachmentsModule from '@/modules/driver-trip/shared/offlineAttachments.service'
import type { QueuedAttachment } from '@/modules/driver-trip/shared/offlineAttachments.service'
import {
  isEventQueueItemDiscardable,
  type EventQueueItemView,
} from '@/modules/driver-trip/shared/eventQueueView.service'
import type { QueuedReport } from '@/modules/driver-trip/shared/offlineQueue.service'
import { countPending } from '@/modules/driver-trip/shared/pendingQueue.service'

const NOW = new Date('2026-10-02T12:00:00.000Z')
const THIRTY_DAYS_AGO = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

function oldDelivery(): QueuedReport {
  return {
    attempts: 3,
    createdAt: THIRTY_DAYS_AGO,
    report: { documentId: 'document-1', idempotencyKey: 'velha', kind: 'deliver', location: null },
  }
}

function oldPhoto(): QueuedAttachment {
  return {
    attachmentKey: 'foto-velha',
    blob: new Blob(['x'], { type: 'image/jpeg' }),
    capturedAt: THIRTY_DAYS_AGO,
    documentId: 'document-1',
    fileName: 'canhoto.jpg',
    kind: 'photo',
  }
}

function view(status: EventQueueItemView['status']): EventQueueItemView {
  return {
    attachmentCount: 0,
    idempotencyKey: 'chave-1',
    kind: 'deliver',
    queuedAt: THIRTY_DAYS_AGO,
    status,
  }
}

/**
 * Spec 227. Decisão do usuário (02/10/2026): "não apaga até sincronizar". A fila apagava, sem
 * avisar, evento e anexo parados há mais de 7 dias (spec 159 T11.4, spec 189 T9.2). O que o
 * motorista fez e o aparelho ainda não conseguiu enviar é a única cópia do trabalho dele.
 */
describe('a fila não apaga o que não subiu (spec 227)', () => {
  it('não existe mais prazo de descarte por idade', () => {
    expect(Object.keys(attachmentsModule)).not.toContain('discardStaleAttachments')
    expect(Object.keys(attachmentsModule)).not.toContain('isAttachmentDiscardable')
    expect(Object.keys(attachmentsModule)).not.toContain('ATTACHMENT_DISCARD_AFTER_MS')
  })

  it('o anexo de 30 dias continua contado como pendência a enviar', () => {
    const counts = countPending({
      attachments: [['evento-ja-aceito', [oldPhoto()]]],
      now: NOW,
      reports: [],
    })

    expect(counts).toEqual({ drainable: 1, rejected: 0, total: 1 })
  })

  it('o evento de 30 dias continua contado como pendência a enviar', () => {
    const counts = countPending({ attachments: [], now: NOW, reports: [oldDelivery()] })

    expect(counts).toEqual({ drainable: 1, rejected: 0, total: 1 })
  })

  it('a abertura do app não chama nenhum descarte por idade', () => {
    const hook = readFileSync(
      new URL('../../src/modules/driver-trip/hooks/useDriverTrip.hook.ts', import.meta.url),
      'utf8',
    )

    expect(hook).not.toInclude('discardStaleAttachments')
  })
})

/**
 * O que nunca sobe sozinho — recusa de negócio — sai só pela mão do motorista, com confirmação
 * (ADR-0075 §6, cópia do legado). Infraestrutura passageira jamais é descartável: a próxima
 * tentativa pode levar o item, e descartá-lo apagaria uma entrega que subiria.
 */
describe('o recusado de negócio é descartável; a infraestrutura passageira, não (spec 227)', () => {
  it('recusa de negócio é descartável', () => {
    expect(isEventQueueItemDiscardable(view({ cause: '409 CONFLICT', state: 'rejected' }))).toBe(
      true,
    )
  })

  it.each([
    '401 UNAUTHORIZED',
    '403 FORBIDDEN',
    '408 REQUEST_TIMEOUT',
    '429 TOO_MANY_REQUESTS',
    '500 INTERNAL',
    '503 UNAVAILABLE',
    'REQUEST_FAILED',
  ])('%s não é recusa de negócio', (cause) => {
    expect(isEventQueueItemDiscardable(view({ cause, state: 'rejected' }))).toBe(false)
  })

  it('item na fila ou com falha de rede nunca é descartável', () => {
    expect(isEventQueueItemDiscardable(view({ state: 'queued' }))).toBe(false)
    expect(isEventQueueItemDiscardable(view({ attempts: 4, state: 'failed' }))).toBe(false)
  })

  it('a tela de pendências oferece o descarte com confirmação', () => {
    const page = readFileSync(
      new URL('../../src/modules/driver-trip/pages/DriverEventQueue.page.tsx', import.meta.url),
      'utf8',
    )

    expect(page).toInclude('isEventQueueItemDiscardable(')
    expect(page).toInclude("t('eventQueue.discard.warning')")
    expect(page).toInclude("t('eventQueue.discard.confirm')")
  })
})
