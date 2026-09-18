/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { isProofAlreadyQueued } from '@/modules/driver-trip/pages/DriverPendingProofs.page'
import { findProofDocumentLabel } from '@/modules/driver-trip/shared/driverTripView.service'
import { documentAttachmentKey } from '@/modules/driver-trip/shared/offlineAttachments.service'
import type { EventQueueItemView } from '@/modules/driver-trip/shared/eventQueueView.service'

const WORKSPACE = new URL(
  '../../src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx',
  import.meta.url,
)
const NOTICE = new URL(
  '../../src/modules/driver-trip/components/DriverProofOutcomeNotice.component.tsx',
  import.meta.url,
)
const HOOK = new URL('../../src/modules/driver-trip/hooks/useDriverTrip.hook.ts', import.meta.url)

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
 * Spec 159 (T11, item 5): documento com anexo já na fila (aguardando envio) não mostra o
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
 * Spec 159 (T11, item 5): a pontualidade fica visível fora da lista de pendentes — um aviso
 * persistente no workspace, dispensável, computado no render (nunca em `useEffect`).
 */
describe('o resultado da pontualidade aparece fora da lista de pendentes (T11, item 5)', () => {
  it('o workspace deriva os avisos visíveis do estado, sem useEffect para isso', () => {
    const workspace = readFileSync(WORKSPACE, 'utf8')

    expect(workspace).toInclude('visibleProofOutcomes')
    expect(workspace).toInclude('dismissedProofOutcomeIds')
    expect(workspace).toInclude('<DriverProofOutcomeNotice')
    expect(readFileSync(NOTICE, 'utf8')).toInclude('proofOutcomeToast')
  })
})

/**
 * Spec 159 (T12, revisão de design): com três avisos na tela, "registrada fora do prazo" sozinho não
 * diz qual foto foi — o aviso nomeia a nota, guardada no toque (depois do envio ela sai da lista).
 */
describe('o aviso de pontualidade nomeia a nota (T12)', () => {
  const pending = {
    deliveredAt: null,
    deliveryProof: null,
    documentId: 'document-1',
    documentNumber: '900203',
    documentSeries: '1',
    recipientName: 'Farmácia Vida',
    tripId: 'trip-1',
    tripStatus: 'completed',
  }

  it('acha a nota na lista de pendentes da raiz', () => {
    expect(
      findProofDocumentLabel({
        documentId: 'document-1',
        snapshot: { isRegisteredDriver: true, pendingProofs: [pending], score: null, trips: [] },
      }),
    ).toEqual({ number: '900203', recipientName: 'Farmácia Vida', series: '1' })
  })

  it('sem a nota em lugar nenhum, não inventa rótulo', () => {
    expect(
      findProofDocumentLabel({
        documentId: 'document-9',
        snapshot: { isRegisteredDriver: true, pendingProofs: [pending], score: null, trips: [] },
      }),
    ).toBeUndefined()
    expect(
      findProofDocumentLabel({ documentId: 'document-1', snapshot: undefined }),
    ).toBeUndefined()
  })

  it('o workspace guarda o rótulo no toque e o aviso separa notícia boa de ruim por ícone', () => {
    const workspace = readFileSync(WORKSPACE, 'utf8')
    const notice = readFileSync(NOTICE, 'utf8')
    expect(workspace).toInclude(
      'findProofDocumentLabel({ documentId: input.documentId, snapshot })',
    )
    expect(notice).toInclude("isGood ? 'check' : 'alert'")
    expect(notice).toInclude('proofOutcomeToastGood')
  })

  it('foto enviada relê o snapshot, senão a contagem de pendentes ficava velha', () => {
    expect(readFileSync(HOOK, 'utf8')).toInclude('result.attachmentsSent.length > 0) {')
  })
})
