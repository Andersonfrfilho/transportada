/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveCargoLayout } from '../../src/trips/domain/cargo-layout.policy.js'

const CAPACIDADE = { capacityM3: '10.000000' }

/** Três paradas na ordem de entrega: a primeira é a que sai primeiro. */
const PARADAS = [
  { documentsWithoutVolume: 0, label: 'Barrinha', sequence: 1, volumeM3: '2.000000' },
  { documentsWithoutVolume: 0, label: 'Descalvado', sequence: 2, volumeM3: '3.000000' },
  { documentsWithoutVolume: 0, label: 'Campinas', sequence: 3, volumeM3: '1.000000' },
]

describe('mapa de carga do baú (spec 076)', () => {
  test('a fatia é proporcional ao volume da parada', () => {
    const layout = resolveCargoLayout({ ...CAPACIDADE, stops: PARADAS })

    expect(layout?.slices.map((slice) => slice.share)).toEqual(['0.2000', '0.3000', '0.1000'])
  })

  /**
   * ⚠️ O coração da feature: **quem entrega por último viaja no fundo**. A ordem de carregamento é o
   * inverso da de entrega, e é isso que evita descarregar duas vezes no mesmo portão.
   */
  test('a última parada da rota fica no fundo', () => {
    const layout = resolveCargoLayout({ ...CAPACIDADE, stops: PARADAS })

    expect(layout?.slices.map((slice) => slice.label)).toEqual([
      'Barrinha',
      'Descalvado',
      'Campinas',
    ])
    expect(layout?.slices.map((slice) => slice.loadOrder)).toEqual([3, 2, 1])
  })

  /** A porta é da primeira entrega: quem sai primeiro tem de estar ao alcance. */
  test('a primeira parada da rota fica na porta', () => {
    const layout = resolveCargoLayout({ ...CAPACIDADE, stops: PARADAS })
    const naPorta = layout?.slices.find((slice) => slice.loadOrder === PARADAS.length)

    expect(naPorta?.label).toBe('Barrinha')
  })

  /** Uma parada só ocupa o baú inteiro que a carga dela ocupa — não o baú todo. */
  test('uma parada só continua proporcional, não vira 100%', () => {
    const layout = resolveCargoLayout({
      ...CAPACIDADE,
      stops: [{ documentsWithoutVolume: 0, label: 'Única', sequence: 1, volumeM3: '2.500000' }],
    })

    expect(layout?.slices[0]?.share).toBe('0.2500')
  })

  /**
   * ⚠️ Excedente vai **fora** do baú, nunca comprimido para caber: comprimir faria o desenho
   * afirmar que a carga cabe, que é a única coisa que ele não pode dizer errado.
   */
  test('o que passa da capacidade é dito fora do baú', () => {
    const layout = resolveCargoLayout({
      capacityM3: '3.000000',
      stops: [{ documentsWithoutVolume: 0, label: 'Cheia', sequence: 1, volumeM3: '4.500000' }],
    })

    expect(layout?.overflowM3).toBe('1.500000')
    expect(layout?.slices[0]?.share).toBe('1.0000')
  })

  test('sem excedente, o campo é zero e não nulo', () => {
    expect(resolveCargoLayout({ ...CAPACIDADE, stops: PARADAS })?.overflowM3).toBe('0.000000')
  })

  /** RF7: nota sem cubagem é dita, nunca vira fatia zero — fatia zero é invisível e some da conferência. */
  test('parada sem cubagem não vira fatia zero', () => {
    const layout = resolveCargoLayout({
      ...CAPACIDADE,
      stops: [
        { documentsWithoutVolume: 0, label: 'Com volume', sequence: 1, volumeM3: '2.000000' },
        { documentsWithoutVolume: 2, label: 'Sem volume', sequence: 2, volumeM3: null },
      ],
    })

    expect(layout?.slices.map((slice) => slice.label)).toEqual(['Com volume'])
    expect(layout?.stopsWithoutVolume).toEqual([{ documentCount: 2, label: 'Sem volume' }])
  })

  /** D3: escala honesta ou nada. Sem capacidade não há proporção, e um retângulo genérico mentiria. */
  test('sem capacidade não há layout', () => {
    expect(resolveCargoLayout({ capacityM3: null, stops: PARADAS })).toBeNull()
  })

  /** Viagem sem parada é baú vazio de verdade — não é ausência. */
  test('viagem sem parada devolve baú vazio', () => {
    const layout = resolveCargoLayout({ ...CAPACIDADE, stops: [] })

    expect(layout).toMatchObject({ overflowM3: '0.000000', slices: [] })
  })
})
