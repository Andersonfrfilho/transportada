/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildPackageBoxRows,
  deriveBoxGrossWeightGrams,
} from '../../src/nfe-imports/domain/package-box.policy.js'

const EMITENTE = '05868574001090'
const PRODUTO = { code: '18245', commercialUnit: 'CX24', description: 'ENERG RED BULL 250ML' }

describe('as caixas que a nota apresenta (spec 085 G004)', () => {
  test('cada produto vira uma caixa, com a embalagem na chave', () => {
    expect(buildPackageBoxRows({ emitterTaxId: EMITENTE, products: [PRODUTO] })).toEqual([
      {
        commercialUnit: 'CX24',
        description: 'ENERG RED BULL 250ML',
        emitterTaxId: EMITENTE,
        productCode: '18245',
      },
    ])
  })

  /**
   * ⚠️ O mesmo produto em `CX12` e `CX24` são **duas caixas**. Medido em 345 NF-e: `CX12` cobre 151
   * produtos distintos — o código diz quantas unidades vão dentro, nunca o tamanho da caixa.
   */
  test('o mesmo produto em embalagens diferentes são duas caixas', () => {
    const rows = buildPackageBoxRows({
      emitterTaxId: EMITENTE,
      products: [PRODUTO, { ...PRODUTO, commercialUnit: 'CX12' }],
    })

    expect(rows).toHaveLength(2)
  })

  /** Nota com dez linhas do mesmo par não manda dez escritas iguais ao banco. */
  test('linhas repetidas do mesmo par viram uma', () => {
    expect(
      buildPackageBoxRows({ emitterTaxId: EMITENTE, products: [PRODUTO, PRODUTO, PRODUTO] }),
    ).toHaveLength(1)
  })

  /**
   * ⚠️ Sem CNPJ do emitente a chave não identifica caixa nenhuma, e a linha ficaria para sempre na
   * fila de medição sem ninguém saber de quem ela é.
   */
  test('emitente sem CNPJ não gera linha', () => {
    expect(buildPackageBoxRows({ emitterTaxId: undefined, products: [PRODUTO] })).toEqual([])
    expect(buildPackageBoxRows({ emitterTaxId: '   ', products: [PRODUTO] })).toEqual([])
  })

  /** Produto sem código ou sem unidade não tem chave — some, em vez de virar linha meio vazia. */
  test('produto sem código ou sem unidade não vira caixa', () => {
    expect(
      buildPackageBoxRows({
        emitterTaxId: EMITENTE,
        products: [
          { ...PRODUTO, code: '  ' },
          { ...PRODUTO, commercialUnit: '' },
        ],
      }),
    ).toEqual([])
  })

  /**
   * ⚠️ **Não corta.** A ocupação casa a caixa com a linha da nota por igualdade de `cProd` e `uCom`;
   * truncar produzia caixa que aparecia na fila, era medida, e nunca alcançava viagem nenhuma —
   * calada. A coluna é `text`, como `nfe_products.code`, justamente para não haver teto a respeitar.
   */
  test('código longo vai inteiro, para o casamento com a linha da nota não falhar', () => {
    const rows = buildPackageBoxRows({
      emitterTaxId: EMITENTE,
      products: [{ ...PRODUTO, code: 'X'.repeat(80), commercialUnit: 'U'.repeat(40) }],
    })

    expect(rows[0]?.productCode).toHaveLength(80)
    expect(rows[0]?.commercialUnit).toHaveLength(40)
  })
})

describe('o peso da caixa deduzido da nota de item único (spec 085 G004)', () => {
  const VOLUMES = [{ grossWeight: '108.6700', quantity: '10' }]

  /** 108,67 kg em 10 caixas = 10,867 kg cada. Único caso em que o `pesoB` fala de UMA caixa. */
  test('nota de um produto só divide o peso bruto pelos volumes', () => {
    expect(deriveBoxGrossWeightGrams({ products: [PRODUTO], volumes: VOLUMES })).toBe(10867)
  })

  /**
   * ⚠️ Com duas linhas o `pesoB` é da carga inteira, e dividi-lo pelos volumes daria a **média**
   * das caixas — número plausível, atribuído à caixa errada. Medido: 9% das notas têm item único.
   */
  test('nota com dois produtos não deduz peso nenhum', () => {
    expect(
      deriveBoxGrossWeightGrams({
        products: [PRODUTO, { ...PRODUTO, code: '18246' }],
        volumes: VOLUMES,
      }),
    ).toBeNull()
  })

  /** `pesoB` zerado é o emitente que não declarou, não caixa que não pesa. */
  test('peso ausente ou zerado não deduz', () => {
    expect(
      deriveBoxGrossWeightGrams({
        products: [PRODUTO],
        volumes: [{ grossWeight: '0', quantity: '10' }],
      }),
    ).toBeNull()
    expect(deriveBoxGrossWeightGrams({ products: [PRODUTO], volumes: [] })).toBeNull()
  })

  test('nota sem volume declarado não deduz', () => {
    expect(
      deriveBoxGrossWeightGrams({
        products: [PRODUTO],
        volumes: [{ grossWeight: '50', quantity: '0' }],
      }),
    ).toBeNull()
  })

  /** O CHECK da coluna recusa acima de 2 t; devolver o valor faria a importação inteira falhar. */
  test('peso por caixa fora do que a coluna aceita não deduz', () => {
    expect(
      deriveBoxGrossWeightGrams({
        products: [PRODUTO],
        volumes: [{ grossWeight: '9000', quantity: '1' }],
      }),
    ).toBeNull()
  })
})
