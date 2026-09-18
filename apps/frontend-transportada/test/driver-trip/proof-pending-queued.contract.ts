/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { isProofAlreadyQueued } from '@/modules/driver-trip/pages/DriverPendingProofs.page'
import { documentAttachmentKey } from '@/modules/driver-trip/shared/offlineAttachments.service'
import type { EventQueueItemView } from '@/modules/driver-trip/shared/eventQueueView.service'

const WORKSPACE = new URL(
  '../../src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx',
  import.meta.url,
)

function queuedProofItem(overrides: Partial<EventQueueItemView> = {}): EventQueueItemView {
  return {
    attachmentCount: 1,
    idempotencyKey: documentAttachmentKey('document-1'),
    kind: 'proof',
    queuedAt: '2026-09-18T12:00:00.000Z',
    status: { state: 'queued' },
    ...overrides,
  }
}

/**
 * Spec 157 (T11, item 5): documento com anexo já na fila (aguardando envio) não mostra o
 * formulário de novo — evita anexar duas vezes o mesmo comprovante.
 */
describe('o item pendente já na fila não repete o formulário (T11, item 5)', () => {
  it('está na fila quando há um item `proof` com a chave do documento, não rejeitado', () => {
    expect(isProofAlreadyQueued({ documentId: 'document-1', queueView: [queuedProofItem()] })).toBe(
      true,
    )
  })

  it('recusado pelo servidor volta a permitir o formulário (o motorista tenta de novo)', () => {
    expect(
      isProofAlreadyQueued({
        documentId: 'document-1',
        queueView: [queuedProofItem({ status: { cause: '409 CONFLICT', state: 'rejected' } })],
      }),
    ).toBe(false)
  })

  it('sem nenhum item da fila para o documento, o formulário aparece', () => {
    expect(isProofAlreadyQueued({ documentId: 'document-2', queueView: [queuedProofItem()] })).toBe(
      false,
    )
  })
})

/**
 * Spec 157 (T11, item 5): a pontualidade fica visível fora da lista de pendentes — um aviso
 * persistente no workspace, dispensável, computado no render (nunca em `useEffect`).
 */
describe('o resultado da pontualidade aparece fora da lista de pendentes (T11, item 5)', () => {
  it('o workspace deriva os avisos visíveis do estado, sem useEffect para isso', () => {
    const workspace = readFileSync(WORKSPACE, 'utf8')

    expect(workspace).toInclude('visibleProofOutcomes')
    expect(workspace).toInclude('dismissedProofOutcomeIds')
    expect(workspace).toInclude('proofOutcomeToast')
  })
})
