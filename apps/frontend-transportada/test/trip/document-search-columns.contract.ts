/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { formatAmount, formatWeightKilograms } from '../../src/modules/shared/decimalAmount.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const SEARCH_PATH = 'src/modules/trip/components/TripDocumentSearch.component.tsx'
const CLIENT_PATH = 'src/modules/nfe-workspace/shared/nfeWorkspaceClient.service.ts'

function readSource(filePath: string): string {
  return readFileSync(new URL(filePath, APPLICATION_ROOT), 'utf8')
}

/**
 * A tabela de busca do diálogo "Nova viagem" nomeava a nota, o cliente e o endereço, e não dizia
 * nem quanto ela vale nem quanto ela pesa — que são as duas grandezas por onde se decide o que sai
 * junto no caminhão.
 */
describe('valor e peso na busca de notas da viagem', () => {
  test('o valor é o mesmo formatador de dinheiro do resto do produto', () => {
    expect(formatAmount('1250.7500')).toBe(formatAmount('1250.75'))
    expect(readSource(SEARCH_PATH)).toContain('formatAmount(document.totalAmount)')
  })

  /**
   * ⚠️ Peso não é dinheiro. As duas grandezas são `numeric(_, 4)` no banco, e reusar `formatAmount`
   * aqui imprimiria `R$ 108,67` numa coluna de massa — o tipo não teria como acusar.
   */
  test('o peso sai em quilo, com as três casas que a NF-e declara', () => {
    expect(formatWeightKilograms('108.6700')).toBe('108,670')
    expect(formatWeightKilograms('0.5000')).toBe('0,500')
    expect(readSource(SEARCH_PATH)).toContain('formatWeightKilograms(document.cargoGrossWeight)')
  })

  /**
   * ⚠️ A origem é obrigatória ao lado do número. `estimated` é `volumes × peso padrão da empresa` —
   * palpite —, e é por peso que alguém decide se ainda cabe carga: palpite com cara de medida faz
   * parar de carregar, ou continuar, pelo motivo errado.
   */
  test('o peso estimado sai marcado, e a marca não tem segunda condição para se esconder', () => {
    const source = readSource(SEARCH_PATH)

    expect(source).toContain("document.cargoWeightSource === 'estimated' ?")
    expect(source).toContain("t('quickCreate.weightEstimated')")
  })

  /** Nota sem `pesoB` e sem peso padrão configurado é célula vazia — nunca zero, que diria "não pesa". */
  test('ausência de peso é célula vazia', () => {
    expect(readSource(SEARCH_PATH)).toContain('document.cargoGrossWeight === null ?')
  })

  test('a listagem publica peso e origem, e a origem é conjunto fechado', () => {
    const source = readSource(CLIENT_PATH)

    expect(source).toContain('cargoGrossWeight: null | string')
    expect(source).toContain("cargoWeightSource: 'estimated' | 'xml' | null")
    expect(source).toContain('isCargoWeightSource(value.cargoWeightSource)')
  })

  /**
   * ⚠️ **Previsão, não receita realizada** — e vazia também no empate entre regras. O seletor da
   * viagem escolhe calado; a listagem devolve ausência de propósito, para a configuração ambígua
   * aparecer em vez de sair um número arbitrário.
   */
  test('o frete previsto sai com o nome da regra que o produziu', () => {
    const source = readSource(SEARCH_PATH)

    expect(source).toContain('formatAmount(document.freightAmount)')
    expect(source).toContain('document.freightRuleName === null ? null : (')
    expect(source).toContain('document.freightAmount === null ?')
  })

  test('a listagem publica o frete e a regra, os dois anuláveis', () => {
    const source = readSource(CLIENT_PATH)

    expect(source).toContain('freightAmount: null | string')
    expect(source).toContain('freightRuleName: null | string')
    expect(source).toContain('isNullableString(value.freightAmount)')
  })

  test('as três colunas ganham cabeçalho traduzido, não texto solto', () => {
    const source = readSource(SEARCH_PATH)

    expect(source).toContain("t('quickCreate.columns.amount')")
    expect(source).toContain("t('quickCreate.columns.weight')")
    expect(source).toContain("t('quickCreate.columns.freight')")
  })
})
