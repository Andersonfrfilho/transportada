/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { buildProposalStopOrder } from '@/modules/trip/shared/proposalView.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

/**
 * A ordem que a proposta entrega ao mapa e à prévia de carga.
 *
 * ⚠️ **Ela é chave de parada, nunca rótulo.** A proposta passava `view.cities` — `"FRANCA"`,
 * `"SAO JOAQUIM DA BARRA"` —, e quem consome ranqueia por `cidade|CEP|número`. Nenhum rótulo casa
 * com nenhuma chave: todas as paradas empatavam em `MAX_SAFE_INTEGER`, o `sort` estável as deixava
 * na ordem em que as **notas** chegaram, e a planta de carga da proposta desenhava um caminhão
 * carregado por um critério que não era o roteiro. Sem erro, sem console, sem nada na tela.
 */
describe('ordem de parada da proposta', () => {
  const documentsById = new Map([
    ['nota-franca', { cityCode: '3516200', number: '1666', postalCode: '14400-000' }],
    ['nota-barra', { cityCode: '3547304', number: '3070', postalCode: '14600-000' }],
    ['nota-barra-2', { cityCode: '3547304', number: '287', postalCode: '14600-000' }],
  ])

  it('devolve a chave de parada na ordem do roteiro', () => {
    const order = buildProposalStopOrder({
      documentsById,
      stops: [{ nfeDocumentIds: ['nota-barra'] }, { nfeDocumentIds: ['nota-franca'] }],
    })

    expect(order).toEqual(['3547304|14600000|3070', '3516200|14400000|1666'])
  })

  /** Duas paradas da mesma cidade são duas chaves: é o endereço que separa, nunca o município. */
  it('não funde paradas da mesma cidade', () => {
    const order = buildProposalStopOrder({
      documentsById,
      stops: [{ nfeDocumentIds: ['nota-barra'] }, { nfeDocumentIds: ['nota-barra-2'] }],
    })

    expect(order).toHaveLength(2)
  })

  /**
   * ⚠️ Chave repetida **não** entra duas vezes: `moveCity` acha a primeira, tira e devolve na
   * posição da segunda — a mesma lista. O botão de descer clicaria e nada aconteceria.
   */
  it('não repete a chave quando duas paradas caem no mesmo portão', () => {
    const order = buildProposalStopOrder({
      documentsById,
      stops: [{ nfeDocumentIds: ['nota-barra'] }, { nfeDocumentIds: ['nota-barra'] }],
    })

    expect(order).toEqual(['3547304|14600000|3070'])
  })

  /** Nota que o pool não traz não vira chave inventada: ela sai da ordem e cai no fim do desenho. */
  it('descarta a parada cuja nota não está no pool', () => {
    expect(
      buildProposalStopOrder({ documentsById, stops: [{ nfeDocumentIds: ['nota-que-nao-veio'] }] }),
    ).toEqual([])
  })

  /** CEP que não fecha oito dígitos não tem chave — cai no mesmo `cidade:` que o mapa agrupa. */
  it('cai para a cidade quando o CEP não serve', () => {
    const order = buildProposalStopOrder({
      documentsById: new Map([['n', { cityCode: '3547304', number: '1', postalCode: '146' }]]),
      stops: [{ nfeDocumentIds: ['n'] }],
    })

    expect(order).toEqual(['cidade:3547304'])
  })

  /** E o componente tem de consumi-la: passar `view.cities` de novo devolve o no-op silencioso. */
  it('alimenta o mapa e a prévia de carga com a ordem, não com as cidades', () => {
    const component = readFileSync(
      new URL('src/modules/trip/components/TripProposalDetail.component.tsx', APPLICATION_ROOT),
      'utf8',
    )

    expect(component).toContain('buildProposalStopOrder')
    expect(component).not.toContain('stopOrder: view.cities')
    expect(component).not.toContain('order={view.cities}')
  })
})
