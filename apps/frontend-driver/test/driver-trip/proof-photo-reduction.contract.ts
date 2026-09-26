/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import type { QueuedAttachment } from '@/modules/driver-trip/shared/offlineAttachments.service'
import {
  replaceAttachmentBlob,
  shouldReduceProofFile,
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
    expect(hook).toInclude('void reduction.finally(() => requestDrain(undefined))')
    expect(recovery).toInclude('await input.reduce(source).catch(() => undefined)')
    expect(recovery).toInclude('clearPendingReduction(')
  })
})
