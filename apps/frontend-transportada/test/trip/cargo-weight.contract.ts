/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripCargoPanel.component.tsx',
  import.meta.url,
)

/**
 * Spec 079 T002. O gêmeo do contrato de ocupação, e existe pelo mesmo motivo: a política sabe que o
 * peso é estimado, e a tela pode imprimir o número sem dizer. O `CLAUDE.md` já registrava a dívida
 * — "quem expuser peso em qualquer superfície leva a origem junto" — e até aqui nenhuma tela
 * mostrava peso, então a regra nunca tinha sido posta à prova.
 */
describe('peso da carga na tela (spec 079 T002)', () => {
  const source = readFileSync(COMPONENT, 'utf8')

  it('imprime a marca de estimativa quando a origem é estimada', () => {
    expect(source).toInclude("cargoWeight.source === 'estimated'")
    expect(source).toInclude("t('cargoWeight.estimated')")
  })

  /**
   * A mesma armadilha da ocupação: um `&&` a mais e a marca some sem ninguém notar.
   *
   * ⚠️ A âncora é `isWeightEstimated` cru, **nunca** `isWeightEstimated ?`. Com o `?` na busca, o
   * `&&` que este teste existe para pegar faz o `indexOf` devolver -1, o trecho sai vazio e a
   * afirmação passa — foi o que aconteceu na primeira escrita, e a mutação revelou.
   */
  it('não esconde a marca atrás de segunda condição', () => {
    const inicio = source.indexOf("cargoWeight.source === 'estimated'")
    expect(inicio).toBeGreaterThan(-1)

    const trecho = source.slice(inicio, source.indexOf('cargoWeight.estimated', inicio))

    expect(trecho).not.toInclude('&&')
  })

  /** Nota sem peso é dita, nunca somada como zero — zero diria que a carga não pesa nada. */
  it('diz quantas notas ficaram fora da conta', () => {
    expect(source).toInclude('cargoWeight.documentsWithoutWeight')
    expect(trip.cargoWeight.withoutWeight).toInclude('não entrou na conta')
  })

  /** O rótulo diz por que o peso é estimado, não só que é. */
  it('explica a origem da estimativa no texto', () => {
    expect(trip.cargoWeight.estimated).toInclude('não declarou o peso')
    expect(trip.cargoWeight.estimated).toInclude('volume')
  })

  /**
   * ⚠️ **Spec 093 revoga a premissa da 079.** A ficha guarda capacidade em massa desde sempre —
   * `fleet_vehicles.capacity_kg`, o `capKG` do MDF-e —, e o que faltava era alguém lê-la fora da
   * emissão fiscal. O percentual passa a existir, e as duas medidas da carga (volume e peso) têm o
   * **mesmo peso visual**: o de peso vivia numa linha de rodapé enquanto o de volume era o número
   * grande, e quem carrega olhava só um dos dois.
   */
  it('anuncia o percentual de peso com a mesma forma do de volume', () => {
    expect(trip.cargoWeight.ratio).toInclude('{{percent}}%')
    expect(trip.cargoWeight.loaded).toInclude('{{capacity}}')
    expect(source).toInclude('styles.cargoMeasureValue')
    expect(source).toInclude("t('cargoWeight.ratio'")
  })

  /**
   * ⚠️ Ausência é ausência: **nunca 0%, nunca 100%**. Veículo sem carga máxima cadastrada com carga
   * dentro é o caso em que um número inventado faz alguém parar de carregar, ou continuar — e o
   * lugar do percentual passa a ser o número absoluto, com o aviso de onde preencher o teto.
   */
  it('troca o percentual pelo número absoluto quando não há teto cadastrado', () => {
    expect(source).toInclude('cargoWeight.payloadRatio === null')
    expect(source).toInclude("t('cargoWeight.withoutCeiling')")
    expect(trip.cargoWeight.withoutCeiling).toInclude('Carga máxima')
  })
})
