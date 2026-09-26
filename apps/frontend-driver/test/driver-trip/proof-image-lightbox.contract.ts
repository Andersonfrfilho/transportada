/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { buildEventQueueView } from '@/modules/driver-trip/shared/eventQueueView.service'
import { removeQueuedAttachmentByKey } from '@/modules/driver-trip/shared/offlineAttachments.service'

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

/**
 * Pedido do usuário (25/09): "cadê opção de remover e opção de abrir imagem". A miniatura ganha
 * "Ver" (abre em tela cheia, diálogo modal) e, ao lado de "Refazer", "Remover" — mas só enquanto o
 * anexo ainda está na fila. Enviado ao servidor, não existe rota de exclusão (spec 082: pontualidade
 * e auditoria já leram aquele anexo) — a saída é "Substituir", nunca "Remover".
 */
describe('a fila diz de qual documento é o anexo "proof" ainda pendente', () => {
  it('o grupo órfão (evento já aceito, anexo por subir) leva o documentId do anexo', () => {
    const view = buildEventQueueView({
      attachments: [
        [
          'document:doc-1',
          [
            {
              attachmentKey: 'anexo-1',
              blob: new Blob(['x']),
              capturedAt: '2026-09-25T12:00:00.000Z',
              documentId: 'doc-1',
              fileName: 'canhoto.jpg',
              kind: 'photo',
            },
          ],
        ],
      ],
      queued: [],
    })
    const proofItem = view.find((item) => item.kind === 'proof')
    expect(proofItem?.documentId).toBe('doc-1')
  })
})

/**
 * Achado de revisão (25/09): filtrar por `documentId` apagaria outros anexos da MESMA nota (spec
 * 211 traz foto de mercadoria além do canhoto) — a remoção é sempre pelo `attachmentKey` do item
 * escolhido.
 */
describe('remover o anexo da fila, pelo attachmentKey do item escolhido', () => {
  it('remove só o item pedido, preservando os outros da mesma nota', () => {
    const canhoto = {
      attachmentKey: 'a1',
      blob: new Blob(['x']),
      capturedAt: '2026-09-25T12:00:00.000Z',
      documentId: 'doc-1',
      fileName: 'canhoto.jpg',
      kind: 'photo' as const,
    }
    const mercadoria = {
      attachmentKey: 'a2',
      blob: new Blob(['y']),
      capturedAt: '2026-09-25T12:01:00.000Z',
      documentId: 'doc-1',
      fileName: 'mercadoria.jpg',
      kind: 'photo' as const,
    }
    expect(
      removeQueuedAttachmentByKey({ attachmentKey: 'a1', items: [canhoto, mercadoria] }),
    ).toEqual([mercadoria])
  })
})

describe('miniatura: "Ver" abre em tela cheia; "Remover" só com o anexo ainda na fila', () => {
  it('existe o botão "Ver" e o diálogo de imagem usa useModalDialog (foco preso, Esc)', () => {
    const card = readSource('src/modules/driver-trip/components/DriverStopCard.component.tsx')
    expect(card).toContain("t('proofCapture.view')")
    const lightbox = readSource(
      'src/modules/driver-trip/components/ProofImageLightbox.component.tsx',
    )
    expect(lightbox).toContain(
      "import { useModalDialog } from '@/modules/shared/useModalDialog.hook'",
    )
    expect(lightbox).toContain('role="dialog"')
    expect(lightbox).toContain('aria-modal')
  })

  it('o diálogo fecha pelo botão voltar do Android (popstate)', () => {
    const lightbox = readSource(
      'src/modules/driver-trip/components/ProofImageLightbox.component.tsx',
    )
    expect(lightbox).toContain("addEventListener('popstate'")
    expect(lightbox).toContain('pushState')
  })

  it('"Remover" só aparece com o anexo ainda na fila; enviado, mostra "Substituir"', () => {
    const card = readSource('src/modules/driver-trip/components/DriverStopCard.component.tsx')
    expect(card).toContain("t('proofCapture.remove')")
    expect(card).toContain("t('proofCapture.replace')")
    expect(card).toContain('isProofQueued')
  })

  it('remover pede confirmação — nunca descarta sem o toque explícito', () => {
    const card = readSource('src/modules/driver-trip/components/DriverStopCard.component.tsx')
    expect(card).toContain("t('proofCapture.confirmRemove')")
    expect(card).toContain('window.confirm(')
  })
})
