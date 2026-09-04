/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { resolveDeliveryProofView } from '../../src/modules/trip/shared/deliveryProof.service'

const ENTREGUE = {
  deliveredAt: '2026-09-02T14:30:00.000Z',
  returnedAt: null,
  returnReason: null,
  separationStatus: 'delivered' as const,
}

const ASSINATURA = {
  createdAt: '2026-09-02T14:31:00.000Z',
  downloadUrl: 'https://bucket.example/a1.png?assinatura=abc',
  expiresAt: '2026-09-02T14:36:00.000Z',
  id: 'a1',
  kind: 'signature' as const,
  receiverName: 'Portaria',
}

describe('prova da entrega (spec 079 T005)', () => {
  /**
   * ⚠️ **O núcleo desta task.** "Não anexou o canhoto" e "não entregou" são fatos diferentes, e uma
   * tela que os funde manda o operador atrás de uma entrega que já aconteceu — ou dá por entregue
   * uma que não foi. São três estados, nunca dois.
   */
  it('separa não entregue de entregue sem comprovante', () => {
    const naoEntregue = resolveDeliveryProofView({
      document: { ...ENTREGUE, deliveredAt: null, separationStatus: 'loaded' },
      proofs: [],
    })
    const semComprovante = resolveDeliveryProofView({ document: ENTREGUE, proofs: [] })

    expect(naoEntregue.state).toBe('not-delivered')
    expect(semComprovante.state).toBe('delivered-without-proof')
    expect(naoEntregue.state).not.toBe(semComprovante.state)
  })

  it('entrega com comprovante traz a hora real e quem recebeu', () => {
    const view = resolveDeliveryProofView({ document: ENTREGUE, proofs: [ASSINATURA] })

    expect(view).toEqual({
      deliveredAt: ENTREGUE.deliveredAt,
      photos: [],
      receiverName: 'Portaria',
      signatures: [ASSINATURA],
      state: 'delivered-with-proof',
    })
  })

  /** Devolvida é o quarto fato, e não é entrega: dizer "entregue sem comprovante" seria mentira. */
  it('devolvida não é entrega', () => {
    const view = resolveDeliveryProofView({
      document: {
        deliveredAt: null,
        returnedAt: '2026-09-02T16:00:00.000Z',
        returnReason: 'Estabelecimento fechado',
        separationStatus: 'returned',
      },
      proofs: [],
    })

    expect(view.state).toBe('returned')
    expect(view.returnReason).toBe('Estabelecimento fechado')
  })

  /** Foto de canhoto não tem quem assine: o nome só sai da assinatura (CHECK do banco). */
  it('não inventa nome de quem recebeu a partir de foto', () => {
    const view = resolveDeliveryProofView({
      document: ENTREGUE,
      proofs: [{ ...ASSINATURA, kind: 'photo', receiverName: '' }],
    })

    expect(view.state).toBe('delivered-with-proof')
    expect(view.receiverName).toBeNull()
    expect(view.photos).toHaveLength(1)
    expect(view.signatures).toHaveLength(0)
  })
})
