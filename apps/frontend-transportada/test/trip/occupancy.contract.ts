/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripOccupancy.component.tsx',
  import.meta.url,
)
const DETAIL = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)

/**
 * Spec 075 T011 / CA6. Este é o contrato **de tela**, e ele existe porque o defeito que previne não
 * aparece em teste de domínio: a política sabe que o valor é estimado, e a interface pode imprimir
 * o número sem dizer. Quem carrega o caminhão lê um percentual e trata como medida.
 */
describe('ocupação na tela (spec 075 T011)', () => {
  const source = readFileSync(COMPONENT, 'utf8')

  it('imprime a marca de estimativa quando a origem é estimada', () => {
    expect(source).toInclude("occupancy.source === 'estimated'")
    expect(source).toInclude("t('occupancy.estimated')")
  })

  /**
   * ⚠️ A marca não pode ser condicional a mais nada além da origem: um `&&` a mais — permissão,
   * aba aberta, tamanho de tela — é o caminho pelo qual ela desaparece sem ninguém notar.
   */
  it('não esconde a marca atrás de segunda condição', () => {
    const marca = source.slice(source.indexOf('isEstimated ?'))
    const trecho = marca.slice(0, marca.indexOf('\n', marca.indexOf('occupancy.estimated')))

    expect(trecho).not.toInclude('&&')
  })

  /** Ausência de capacidade não desenha nada — nunca 0% nem 100%. */
  it('não desenha painel sem capacidade conhecida', () => {
    expect(source).toInclude('if (occupancy === null) return null')
  })

  /** O rótulo diz por que o número é estimado, não só que é. */
  it('explica a origem da estimativa no texto', () => {
    expect(trip.occupancy.estimated).toInclude('não traz medida')
    expect(trip.occupancy.estimated).toInclude('fator de cubagem')
  })

  /** Capacidade que veio de referência avisa que não é medida deste baú (spec 075 D2). */
  it('distingue capacidade medida de referência do tipo', () => {
    expect(source).toInclude("occupancy.capacitySource === 'reference'")
    expect(trip.occupancy.capacityReference).toInclude('referência')
  })

  /** Nota sem cubagem é dita, nunca somada como zero (RF7). */
  it('diz quantas notas ficaram fora da conta', () => {
    expect(source).toInclude('occupancy.documentsWithoutVolume > 0')
    expect(trip.occupancy).toHaveProperty('withoutVolume_other')
  })

  /** O painel tem de estar montado no detalhe, senão o contrato acima protege código morto. */
  it('está montado no detalhe da viagem', () => {
    expect(readFileSync(DETAIL, 'utf8')).toInclude(
      '<TripOccupancyPanel occupancy={trip.occupancy} />',
    )
  })
})
