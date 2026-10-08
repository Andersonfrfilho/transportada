/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import type { QueuedAttachment } from '@/modules/driver-trip/shared/offlineAttachments.service'
import { settleReductionWithinTimeout } from '@/modules/driver-trip/shared/proofPhotoRecovery.service'
import {
  replaceAttachmentBlob,
  shouldReduceProofFile,
  type ReducedProofPhoto,
} from '@/modules/driver-trip/shared/proofPhotoReduction.service'

const HOOK = 'src/modules/driver-trip/hooks/useDriverTrip.hook.ts'
const RECOVERY = 'src/modules/driver-trip/shared/proofPhotoRecovery.service.ts'

function queued(attachmentKey: string, blob: Blob): QueuedAttachment {
  return {
    attachmentKey,
    blob,
    capturedAt: '2026-09-26T12:00:00.000Z',
    documentId: 'document-1',
    fileName: 'IMG_0001.HEIC',
    kind: 'photo',
    subHash: 'owner',
  }
}

describe('a foto do comprovante sai leve do aparelho (pedido de 26/09)', () => {
  it('só a foto reduz — assinatura e PDF anexado ficam como estão', () => {
    const image = new File(['x'], 'canhoto.jpg', { type: 'image/jpeg' })
    const pdf = new File(['x'], 'canhoto.pdf', { type: 'application/pdf' })

    expect(shouldReduceProofFile({ file: image, kind: 'photo' })).toBe(true)
    expect(shouldReduceProofFile({ file: pdf, kind: 'photo' })).toBe(false)
    expect(shouldReduceProofFile({ file: image, kind: 'signature' })).toBe(false)
  })

  it('a versão leve troca só o arquivo do anexo certo, sem tocar nos outros', () => {
    const original = new Blob(['original-pesado'])
    const other = new Blob(['outro'])
    const reduced = new Blob(['leve'])

    const items = replaceAttachmentBlob({
      attachmentKey: 'key-canhoto',
      blob: reduced,
      fileName: 'IMG_0001.jpg',
      items: [queued('key-canhoto', original), queued('key-outro', other)],
    })

    expect(items[0]?.blob).toBe(reduced)
    expect(items[0]?.fileName).toBe('IMG_0001.jpg')
    expect(items[1]?.blob).toBe(other)
  })

  it('grava primeiro, reduz depois e só então libera o envio; falha na redução mantém o original', () => {
    const hook = readFileSync(HOOK, 'utf8')
    const enqueueAt = hook.indexOf('await enqueueAttachment(')
    const reduceAt = hook.indexOf('reduceQueuedProofPhoto({', enqueueAt)
    const recovery = readFileSync(RECOVERY, 'utf8')

    expect(enqueueAt).toBeGreaterThan(-1)
    expect(reduceAt).toBeGreaterThan(enqueueAt)
    expect(hook).toInclude('void reduction.finally(() => {')
    expect(hook).toInclude(
      "window.setTimeout(() => requestDrain(undefined, 'immediate'), PROOF_AUTO_DRAIN_GRACE_MS)",
    )
    expect(recovery).toInclude('settleReductionWithinTimeout({')
    expect(recovery).toInclude('input.reduction.catch(() => undefined)')
    expect(recovery).toInclude('clearPendingReduction(')
  })

  /**
   * Defeito medido em produção (01/10): `Image.onload`/`canvas.toBlob` não prometem assentar, e a
   * drenagem pula o anexo enquanto `pendingReduction` for `true` — a foto ficava em "enviando" para
   * sempre, sem erro e sem retentativa. O teto transforma o silêncio em falha tratada.
   */
  it('redução que nunca assenta estoura o teto e libera o anexo em vez de prender a foto', async () => {
    const nunca = new Promise<ReducedProofPhoto>(() => undefined)

    const settled = await settleReductionWithinTimeout({ reduction: nunca, timeoutMs: 5 })

    expect(settled).toBeUndefined()
  })

  it('redução que falha também devolve undefined — quem chama trata igual ao estouro', async () => {
    const falha = Promise.reject(new Error('PROOF_PHOTO_ENCODE_FAILED'))

    const settled = await settleReductionWithinTimeout({ reduction: falha, timeoutMs: 5_000 })

    expect(settled).toBeUndefined()
  })
})
