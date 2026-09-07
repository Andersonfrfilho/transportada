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

  /**
   * Ausência de capacidade não imprime ocupação — nunca 0% nem 100%.
   *
   * ⚠️ A afirmação era `if (occupancy === null) return null`, a linha literal, e a spec 079
   * a quebrou legitimamente: o **peso** da carga não depende de capacidade, e veículo sem cubagem
   * cadastrada é o caso comum. Sem capacidade o componente passa a desenhar só o peso. O que esta
   * regra sempre quis dizer continua de pé, e é o que se afirma agora: nenhuma razão de ocupação
   * sai sem capacidade.
   */
  it('não imprime ocupação sem capacidade conhecida', () => {
    const semCapacidade = source.slice(
      source.indexOf('if (occupancy === null)'),
      source.indexOf('const percent'),
    )

    expect(semCapacidade).not.toInclude('occupancy.ratio')
    expect(semCapacidade).not.toInclude('occupancyRatio')
    expect(source).toInclude('if (occupancy === null) return')
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

  /**
   * ⚠️ Escala do banco é seis casas, e `2.250000 m³` faz o operador ler precisão como exatidão —
   * num número que é **estimado**. Duas casas, vírgula decimal, formato do país.
   */
  it('imprime em formato brasileiro, com duas casas', () => {
    expect(source).toInclude("Intl.NumberFormat('pt-BR'")
    expect(source).toInclude('maximumFractionDigits: 2')
    expect(source).not.toInclude('occupancy.capacityM3}')
  })

  /** As medidas dizem de onde o m³ saiu: um total sem procedência não se confere. */
  it('mostra as medidas que produziram o volume', () => {
    expect(source).toInclude('occupancy.capacityDimensions')
    expect(trip.occupancy.dimensions).toInclude('{{length}} × {{width}} × {{height}}')
  })

  /** No degrau em que alguém digitou o volume não há medidas — e inventá-las seria fabricar origem. */
  it('não desenha medidas quando elas não existem', () => {
    expect(source).toInclude('dimensions === null ? null :')
  })

  /** Nota sem cubagem é dita, nunca somada como zero (RF7). */
  it('diz quantas notas ficaram fora da conta', () => {
    expect(source).toInclude('occupancy.documentsWithoutVolume > 0')
    expect(trip.occupancy).toHaveProperty('withoutVolume_other')
  })

  /** O painel tem de estar montado no detalhe, senão o contrato acima protege código morto. */
  it('está montado no detalhe da viagem', () => {
    expect(readFileSync(DETAIL, 'utf8')).toInclude('<TripCargoPanel')
    expect(readFileSync(DETAIL, 'utf8')).toInclude('occupancy={trip.occupancy}')
  })
})

/**
 * Spec 093: o teto de peso que sempre esteve no banco. `fleet_vehicles.capacity_kg` é o `capKG` do
 * MDF-e, preenchida em 10 dos 12 veículos desta base — o que faltava era a montagem lê-la.
 */
describe('teto de peso da montagem', () => {
  const source = readFileSync(COMPONENT, 'utf8')

  it('imprime quanto da carga máxima do veículo a carga ocupa', () => {
    expect(source).toInclude("t('cargoWeight.ratio'")
    expect(trip.cargoWeight.ratio).toInclude('{{percent}}%')
    expect(trip.cargoWeight.loaded).toInclude('{{capacity}}')
  })

  /**
   * ⚠️ As **duas** medidas com o mesmo peso visual: volume e peso dizem coisas diferentes e
   * igualmente decisivas — um baú cheio de papel higiênico está longe do teto de massa, e uma
   * carreta de bebida enche o peso com o baú pela metade. Com uma delas em texto de rodapé, quem
   * carrega olha só a outra.
   */
  it('dá às duas medidas a mesma forma, lado a lado', () => {
    expect(source).toInclude('styles.cargoMeasures')
    expect(source).toInclude("t('occupancy.label')")
    expect(source).toInclude("t('cargoWeight.label')")
    const volume = source.indexOf("t('occupancy.ratio'")
    const peso = source.indexOf("t('cargoWeight.ratio'")
    expect(volume).toBeGreaterThan(-1)
    expect(peso).toBeGreaterThan(-1)
  })

  /**
   * ⚠️ Ausência é ausência: nunca 0%, nunca 100%. Veículo sem teto cadastrado com carga dentro é o
   * caso em que um número inventado faz alguém parar de carregar, ou continuar — a mesma regra que
   * a ocupação de volume segue ao lado.
   */
  it('não inventa percentual quando o teto não está cadastrado', () => {
    expect(source).toInclude('cargoWeight.payloadRatio === null')
    expect(source).toInclude('cargoWeight.maxPayloadKg === null ? (')
  })
})
