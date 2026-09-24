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
      cargoPhotos: [],
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

/** Spec 182: fotos da carga — cargo */
describe('fotos da carga (spec 182)', () => {
  const FOTO_CARGA_1 = {
    createdAt: '2026-09-02T14:32:00.000Z',
    downloadUrl: 'https://bucket.example/cargo1.jpg?token=xyz',
    expiresAt: '2026-09-02T14:37:00.000Z',
    id: 'cargo1',
    kind: 'cargo' as const,
    receiverName: '',
  }

  const FOTO_CARGA_2 = {
    createdAt: '2026-09-02T14:33:00.000Z',
    downloadUrl: 'https://bucket.example/cargo2.jpg?token=abc',
    expiresAt: '2026-09-02T14:38:00.000Z',
    id: 'cargo2',
    kind: 'cargo' as const,
    receiverName: '',
  }

  /** Spec 182 RF1/CA06: `cargo` é um tipo de comprovante separado. */
  it('aceita múltiplas fotos de carga na mesma entrega', () => {
    const view = resolveDeliveryProofView({
      document: ENTREGUE,
      proofs: [FOTO_CARGA_1, FOTO_CARGA_2],
    })

    expect(view.state).toBe('delivered-with-proof')
    expect(view.cargoPhotos).toHaveLength(2)
    expect(view.photos).toHaveLength(0)
    expect(view.signatures).toHaveLength(0)
  })

  /** Spec 182 CA06: canhoto e fotos de carga são grupos distintos. */
  it('separa canhoto de fotos de carga', () => {
    const CANHOTO = { ...ASSINATURA, kind: 'photo' as const, receiverName: '' }
    const view = resolveDeliveryProofView({
      document: ENTREGUE,
      proofs: [CANHOTO, FOTO_CARGA_1, FOTO_CARGA_2],
    })

    expect(view.photos).toEqual([CANHOTO])
    expect(view.cargoPhotos).toEqual([FOTO_CARGA_1, FOTO_CARGA_2])
    expect(view.signatures).toHaveLength(0)
  })

  /** Spec 182 ADR-0067 §5: assinatura tem prioridade sobre canhoto. */
  it('assinatura com nome tem prioridade sobre canhoto', () => {
    const CANHOTO_COM_NOME = {
      createdAt: '2026-09-02T14:32:00.000Z',
      downloadUrl: 'https://bucket.example/canhoto.jpg',
      expiresAt: '2026-09-02T14:37:00.000Z',
      id: 'canhoto1',
      kind: 'photo' as const,
      receiverName: 'João da Portaria',
    }
    const view = resolveDeliveryProofView({
      document: ENTREGUE,
      proofs: [ASSINATURA, CANHOTO_COM_NOME],
    })

    // Assinatura ('Portaria') tem prioridade sobre canhoto ('João da Portaria')
    expect(view.receiverName).toBe('Portaria')
  })

  /** Spec 182 ADR-0067 §5: sem assinatura, nome vem do canhoto. */
  it('nome vem de canhoto quando não há assinatura', () => {
    const CANHOTO_COM_NOME = {
      createdAt: '2026-09-02T14:32:00.000Z',
      downloadUrl: 'https://bucket.example/canhoto.jpg',
      expiresAt: '2026-09-02T14:37:00.000Z',
      id: 'canhoto1',
      kind: 'photo' as const,
      receiverName: 'Maria',
    }
    const view = resolveDeliveryProofView({
      document: ENTREGUE,
      proofs: [CANHOTO_COM_NOME, FOTO_CARGA_1],
    })

    expect(view.receiverName).toBe('Maria')
  })

  /** Spec 182 ADR-0067 §5: sem assinatura nem canhoto com nome, nada. */
  it('nome nulo quando não há assinatura nem canhoto com nome', () => {
    const CANHOTO_SEM_NOME = {
      ...ASSINATURA,
      kind: 'photo' as const,
      receiverName: '',
    }
    const view = resolveDeliveryProofView({
      document: ENTREGUE,
      proofs: [CANHOTO_SEM_NOME, FOTO_CARGA_1],
    })

    expect(view.receiverName).toBeNull()
  })
})
