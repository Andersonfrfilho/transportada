/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  describeAttachmentFailure,
  DriverTripRequestError,
} from '@/modules/driver-trip/shared/driverTripClient.service'
import { createProofUploadProgressStore } from '@/modules/driver-trip/shared/proofUploadProgress.service'

describe('a foto que não termina de subir diz por quê (pedido do usuário, 14/10)', () => {
  it('rede, tempo esgotado e gateway fora viram motivo; recusa do servidor não', () => {
    expect(
      describeAttachmentFailure(
        new DriverTripRequestError({ code: 'OFFLINE', isOffline: true, isTimeout: false }),
      ),
    ).toEqual({ kind: 'network' })
    expect(
      describeAttachmentFailure(
        new DriverTripRequestError({ code: 'OFFLINE', isOffline: true, isTimeout: true }),
      ),
    ).toEqual({ kind: 'timeout' })
    expect(
      describeAttachmentFailure(
        new DriverTripRequestError({ code: 'BAD_GATEWAY', isOffline: false, status: 502 }),
      ),
    ).toEqual({ kind: 'server', status: 502 })
    expect(
      describeAttachmentFailure(
        new DriverTripRequestError({
          code: 'TRIP_DELIVERY_PROOF_TOO_LARGE',
          isOffline: false,
          status: 422,
        }),
      ),
    ).toBeUndefined()
  })

  it('a falha fica no progresso e o próximo envio começa limpo', () => {
    const store = createProofUploadProgressStore()
    store.begin('doc:photo')
    store.fail('doc:photo', { kind: 'server', status: 503 })
    expect(store.get('doc:photo')).toEqual({ failure: { kind: 'server', status: 503 }, percent: 0 })
    store.begin('doc:photo')
    expect(store.get('doc:photo')).toEqual({ percent: 0 })
  })

  it('a nuvem só anima com upload real: sem porcentagem, o cartão mostra o relógio parado', () => {
    const source = readFileSync(
      new URL(
        '../../src/modules/driver-trip/components/ProofUploadStatus.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )
    const card = source.slice(source.indexOf("upload.status === 'uploading'"))
    expect(card.indexOf('upload.uploadPercent === undefined')).toBeGreaterThan(-1)
    expect(card.indexOf('<ProofSendingThrower />')).toBeGreaterThan(
      card.indexOf('upload.uploadPercent === undefined'),
    )
    expect(source.match(/<ProofSendingThrower \/>/gu)).toHaveLength(1)
  })

  it('foto salva esperando "Confirmar entrega" tem animação própria, que não é a da nuvem', () => {
    const source = readFileSync(
      new URL(
        '../../src/modules/driver-trip/components/ProofUploadStatus.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )
    const waiting = source.slice(
      source.indexOf("upload.status === 'waiting'"),
      source.indexOf("upload.status === 'uploading'"),
    )
    expect(waiting).toContain("upload.waitingFor === 'confirm'")
    expect(waiting).toContain('<ProofReadyToConfirm />')
    expect(waiting).not.toContain('<ProofSendingThrower />')
  })
})
