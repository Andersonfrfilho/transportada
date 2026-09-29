/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  awaitingDeliveryAttachmentKey,
  discardAttachmentsAwaitingDelivery,
  enqueueAttachment,
  releaseAttachmentsAwaitingDelivery,
  type QueuedAttachment,
} from '@/modules/driver-trip/shared/offlineAttachments.service'

import { createMemoryAttachments, createMemoryQueue } from '../fixtures/memory-queue-stores.fixture'

const NOW = '2026-09-29T13:00:00.000Z'

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

const CARD = readSource('src/modules/driver-trip/components/DriverStopCard.component.tsx')
const HOOK = readSource('src/modules/driver-trip/hooks/useDriverTrip.hook.ts')
const WORKSPACE = readSource('src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx')

function photo(documentId: string, attachmentKey: string): QueuedAttachment {
  return {
    attachmentKey,
    blob: new Blob([new Uint8Array(10)], { type: 'image/jpeg' }),
    capturedAt: NOW,
    documentId,
    fileName: 'canhoto.jpg',
    kind: 'photo',
  }
}

function slice(input: {
  readonly from: string
  readonly source: string
  readonly to: string
}): string {
  const start = input.source.indexOf(input.from)
  expect(start).toBeGreaterThan(-1)
  const end = input.source.indexOf(input.to, start)
  expect(end).toBeGreaterThan(start)
  return input.source.slice(start, end)
}

/**
 * Spec 218 (pendência da Fase 4): a foto colhida no gate e, em seguida, "Cancelar" ou "Não
 * entreguei" — a entrega que ela esperava não vai acontecer, e o anexo ficava parado em
 * `awaiting-delivery:<id>` até o descarte de 7 dias. Os dois caminhos o tiram da fila na hora.
 */
describe('a foto do gate sai da fila quando a entrega não vai acontecer (spec 218)', () => {
  it('descarta só a espera daquela nota — a de outra nota e a de evento ficam', async () => {
    const store = createMemoryQueue()
    const attachmentStore = createMemoryAttachments([['entrega-9', [photo('document-9', 'x')]]])
    for (const [documentId, key] of [
      ['document-1', 'anexo-1'],
      ['document-1', 'anexo-2'],
      ['document-2', 'anexo-3'],
    ] as const) {
      await enqueueAttachment({
        attachment: photo(documentId, key),
        attachmentStore,
        awaitingDelivery: true,
        store,
      })
    }

    const discarded = await discardAttachmentsAwaitingDelivery({
      attachmentStore,
      documentId: 'document-1',
    })

    expect(discarded).toBe(2)
    expect(attachmentStore.entries().get(awaitingDeliveryAttachmentKey('document-1'))).toBe(
      undefined,
    )
    expect(attachmentStore.entries().get(awaitingDeliveryAttachmentKey('document-2'))).toHaveLength(
      1,
    )
    expect(attachmentStore.entries().get('entrega-9')).toHaveLength(1)
  })

  it('depois de solta para a entrega, a foto não é mais da espera — nada é descartado', async () => {
    const store = createMemoryQueue()
    const attachmentStore = createMemoryAttachments()
    await enqueueAttachment({
      attachment: photo('document-1', 'anexo-1'),
      attachmentStore,
      awaitingDelivery: true,
      store,
    })
    await releaseAttachmentsAwaitingDelivery({
      attachmentStore,
      documentId: 'document-1',
      eventKey: 'entrega-1',
    })

    const discarded = await discardAttachmentsAwaitingDelivery({
      attachmentStore,
      documentId: 'document-1',
    })

    expect(discarded).toBe(0)
    expect(attachmentStore.entries().get('entrega-1')).toHaveLength(1)
  })

  it('sem nada esperando, não mexe na fila', async () => {
    const attachmentStore = createMemoryAttachments()
    expect(
      await discardAttachmentsAwaitingDelivery({ attachmentStore, documentId: 'document-1' }),
    ).toBe(0)
    expect(attachmentStore.entries().size).toBe(0)
  })
})

describe('os dois caminhos que desistem da entrega descartam a espera (spec 218)', () => {
  it('"Cancelar" do gate pede o descarte da espera daquela nota', () => {
    const row = slice({
      from: 'function DocumentRow(',
      source: CARD,
      to: 'type PreDeliveryProofGateProps',
    })
    const gateCall = row.slice(row.indexOf('<PreDeliveryProofGate'))
    const onCancel = gateCall.slice(gateCall.indexOf('onCancel={'), gateCall.indexOf('onConfirm={'))
    expect(onCancel).toInclude('onDiscardProofAwaitingDelivery(document.id)')
    expect(onCancel).toInclude('setOpenDeliveryGate(false)')
  })

  it('"Não entreguei" confirmado fecha o gate aberto da mesma nota', () => {
    const row = slice({
      from: 'function DocumentRow(',
      source: CARD,
      to: 'type PreDeliveryProofGateProps',
    })
    const notDelivered = row.slice(row.indexOf('<DriverNotDeliveredForm'))
    expect(notDelivered.slice(0, notDelivered.indexOf('onRetryOccurrenceTypes='))).toInclude(
      'setOpenDeliveryGate(false)',
    )
  })

  it('a devolução aceita na fila descarta a espera da nota devolvida', () => {
    const body = slice({
      from: 'function reportNotDelivered(',
      source: HOOK,
      to: 'function reportStopOccurrence(',
    })
    const accepted = body.indexOf('if (!result.accepted) return result.reason')
    const discard = body.indexOf('discardAttachmentsAwaitingDelivery({')
    expect(accepted).toBeGreaterThan(-1)
    expect(discard).toBeGreaterThan(accepted)
  })

  it('o hook expõe o descarte, e a página o liga ao cartão', () => {
    const body = slice({
      from: 'async function discardProofAwaitingDelivery(',
      source: HOOK,
      to: '\n  }',
    })
    expect(body).toInclude('discardAttachmentsAwaitingDelivery({')
    expect(body).toInclude('refreshQueueView()')
    expect(WORKSPACE).toInclude(
      'onDiscardProofAwaitingDelivery={handleDiscardProofAwaitingDelivery}',
    )
    expect(WORKSPACE).toInclude('driverTrip.discardProofAwaitingDelivery(documentId)')
  })
})
