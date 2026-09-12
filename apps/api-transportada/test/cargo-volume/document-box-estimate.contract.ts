/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveDocumentCargoEstimate,
  resolveMeasuredCargoVolume,
} from '../../src/nfe-documents/domain/cargo-volume.policy.js'

/** 400 × 400 × 250 mm = 0,040 m³, a caixa que o conferente mediu. */
const MEASURED_BOX = '0.040000'
/** O fator da espécie: cada volume da nota vale 0,050 m³ enquanto ninguém mede. */
const SPECIES_FACTOR = '0.050000'
const COMPANY_MEDIAN = '0.036000'

const measuredLine = { boxVolumeM3: MEASURED_BOX, quantity: '4', unitsPerBox: 1 }
const unmeasuredLine = { boxVolumeM3: null, quantity: '6', unitsPerBox: 1 }

describe('a caixa presumida sai do resíduo da nota (spec 144 D2)', () => {
  /**
   * Nota de 10 volumes a 0,050: o total é 0,500 m³ e ninguém mediu nada. As dez caixas valem
   * 0,050 cada — o desenho soma exatamente o que a fatia mede, coisa que a mediana da empresa não
   * garante.
   */
  test('nota sem ficha nenhuma vira qVol caixas de total ÷ qVol', () => {
    expect(
      resolveDocumentCargoEstimate({
        items: [{ boxVolumeM3: null, quantity: '10', unitsPerBox: 1 }],
        medianBoxVolumeM3: COMPANY_MEDIAN,
        volumeFactor: SPECIES_FACTOR,
        volumeQuantity: '10',
      }),
    ).toEqual({
      estimateSource: 'note',
      source: 'estimated',
      unmeasuredBoxCount: 10,
      unmeasuredBoxVolumeM3: '0.050000',
      volumeM3: '0.500000',
    })
  })

  /**
   * O exemplo da D2: produto A medido em 4 caixas de 0,040 (0,160), produto B com 6 unidades sem
   * ficha. O resíduo 0,340 se divide nas 6 caixas — 0,056667 cada — e a nota vale o total, 0,500.
   */
  test('nota meio medida tira o medido do total e divide o resto entre as caixas sem ficha', () => {
    expect(
      resolveDocumentCargoEstimate({
        items: [measuredLine, unmeasuredLine],
        medianBoxVolumeM3: COMPANY_MEDIAN,
        volumeFactor: SPECIES_FACTOR,
        volumeQuantity: '10',
      }),
    ).toEqual({
      estimateSource: 'note',
      source: 'partial',
      unmeasuredBoxCount: 6,
      unmeasuredBoxVolumeM3: '0.056667',
      volumeM3: '0.500000',
    })
  })

  /** A linha medida em `UN` com 30 unidades e 12 por caixa ocupa 3 caixas, como em toda a 085. */
  test('a linha medida conta caixas arredondando para cima antes de tirar do total', () => {
    expect(
      resolveDocumentCargoEstimate({
        items: [{ boxVolumeM3: MEASURED_BOX, quantity: '30', unitsPerBox: 12 }, unmeasuredLine],
        medianBoxVolumeM3: COMPANY_MEDIAN,
        volumeFactor: SPECIES_FACTOR,
        volumeQuantity: '10',
      }),
    ).toEqual({
      estimateSource: 'note',
      source: 'partial',
      unmeasuredBoxCount: 6,
      /** (0,500 − 3 × 0,040) ÷ 6 */
      unmeasuredBoxVolumeM3: '0.063333',
      volumeM3: '0.500000',
    })
  })

  /**
   * O medido já passou do total da nota (4 × 0,040 = 0,160 contra 2 × 0,050 = 0,100): o resíduo não
   * existe, e a caixa sem ficha cai no degrau 3 — a mediana da empresa, como antes desta spec.
   */
  test('resíduo negativo cai na mediana da empresa, e a nota soma medido mais mediana', () => {
    expect(
      resolveDocumentCargoEstimate({
        items: [measuredLine, { boxVolumeM3: null, quantity: '2', unitsPerBox: 1 }],
        medianBoxVolumeM3: COMPANY_MEDIAN,
        volumeFactor: SPECIES_FACTOR,
        volumeQuantity: '2',
      }),
    ).toEqual({
      estimateSource: 'median',
      source: 'partial',
      unmeasuredBoxCount: 2,
      unmeasuredBoxVolumeM3: COMPANY_MEDIAN,
      volumeM3: '0.232000',
    })
  })

  test('sem total na nota, a caixa sem ficha usa a mediana e a nota soma medido mais mediana', () => {
    expect(
      resolveDocumentCargoEstimate({
        items: [measuredLine, unmeasuredLine],
        medianBoxVolumeM3: COMPANY_MEDIAN,
        volumeFactor: null,
        volumeQuantity: null,
      }),
    ).toEqual({
      estimateSource: 'median',
      source: 'partial',
      unmeasuredBoxCount: 6,
      unmeasuredBoxVolumeM3: COMPANY_MEDIAN,
      volumeM3: '0.376000',
    })
  })

  /**
   * ⚠️ Toda linha com ficha: a D2 nem é consultada. A resposta é a mesma de
   * `resolveMeasuredCargoVolume` — o total da nota e a mediana não movem uma caixa medida.
   */
  test('nota toda medida não consulta o total nem a mediana', () => {
    const items = [measuredLine, { boxVolumeM3: '0.010000', quantity: '5', unitsPerBox: 1 }]
    const legacy = resolveMeasuredCargoVolume({ fallbackBoxVolumeM3: COMPANY_MEDIAN, items })

    expect(
      resolveDocumentCargoEstimate({
        items,
        medianBoxVolumeM3: COMPANY_MEDIAN,
        volumeFactor: SPECIES_FACTOR,
        volumeQuantity: '1',
      }),
    ).toEqual({
      estimateSource: 'none',
      source: 'measured',
      unmeasuredBoxCount: 0,
      unmeasuredBoxVolumeM3: null,
      volumeM3: legacy?.volumeM3 ?? 'measured volume expected',
    })
  })

  /**
   * `qVol` menor que as linhas sem ficha: a contagem segue as linhas — 8 caixas —, e o que se
   * conserva é o m³: 8 × 0,050 = 0,400, o total da nota.
   */
  test('qVol menor que as linhas conserva o m³ e deixa a caixa menor', () => {
    expect(
      resolveDocumentCargoEstimate({
        items: [{ boxVolumeM3: null, quantity: '8', unitsPerBox: 1 }],
        medianBoxVolumeM3: null,
        volumeFactor: '0.100000',
        volumeQuantity: '4',
      }),
    ).toEqual({
      estimateSource: 'note',
      source: 'estimated',
      unmeasuredBoxCount: 8,
      unmeasuredBoxVolumeM3: '0.050000',
      volumeM3: '0.400000',
    })
  })

  /**
   * Sem total e sem ficha a nota continua sem cubagem — a mediana não inventa m³ de nota, ela só
   * dá tamanho às caixas no desenho, como hoje. A lista do que falta medir ainda precisa saber
   * quantas caixas são e de onde saiu o tamanho delas, por isso o retorno nunca é `null`.
   */
  test('sem ficha, sem total e sem mediana a nota fica sem volume, mas as caixas continuam contadas', () => {
    expect(
      resolveDocumentCargoEstimate({
        items: [unmeasuredLine],
        medianBoxVolumeM3: null,
        volumeFactor: null,
        volumeQuantity: null,
      }),
    ).toEqual({
      estimateSource: 'none',
      source: null,
      unmeasuredBoxCount: 6,
      unmeasuredBoxVolumeM3: null,
      volumeM3: null,
    })
  })

  test('sem ficha e sem total, a mediana dá tamanho às caixas sem dar volume à nota', () => {
    expect(
      resolveDocumentCargoEstimate({
        items: [unmeasuredLine],
        medianBoxVolumeM3: COMPANY_MEDIAN,
        volumeFactor: null,
        volumeQuantity: null,
      }),
    ).toEqual({
      estimateSource: 'median',
      source: null,
      unmeasuredBoxCount: 6,
      unmeasuredBoxVolumeM3: COMPANY_MEDIAN,
      volumeM3: null,
    })
  })

  test('nota sem linha nenhuma devolve o total por espécie quando ele existe, e nada sem ele', () => {
    expect(
      resolveDocumentCargoEstimate({
        items: [],
        medianBoxVolumeM3: COMPANY_MEDIAN,
        volumeFactor: SPECIES_FACTOR,
        volumeQuantity: '10',
      }),
    ).toEqual({
      estimateSource: 'none',
      source: 'estimated',
      unmeasuredBoxCount: 0,
      unmeasuredBoxVolumeM3: null,
      volumeM3: '0.500000',
    })
    expect(
      resolveDocumentCargoEstimate({
        items: [],
        medianBoxVolumeM3: COMPANY_MEDIAN,
        volumeFactor: null,
        volumeQuantity: null,
      }),
    ).toEqual({
      estimateSource: 'none',
      source: null,
      unmeasuredBoxCount: 0,
      unmeasuredBoxVolumeM3: null,
      volumeM3: null,
    })
  })

  /** `countMeasuredBoxes` não arredonda quando cabe uma unidade por caixa; o divisor da nota arredonda. */
  test('quantidade fracionária sem ficha conta caixa inteira no divisor', () => {
    expect(
      resolveDocumentCargoEstimate({
        items: [{ boxVolumeM3: null, quantity: '2.5', unitsPerBox: 1 }],
        medianBoxVolumeM3: null,
        volumeFactor: '0.100000',
        volumeQuantity: '3',
      }),
    ).toEqual({
      estimateSource: 'note',
      source: 'estimated',
      unmeasuredBoxCount: 3,
      unmeasuredBoxVolumeM3: '0.100000',
      volumeM3: '0.300000',
    })
  })

  /** Resíduo de 0,000002 m³ em cinco caixas arredonda para zero — caixa de zero m³ não vai ao desenho. */
  test('resíduo que arredonda para caixa de zero m³ cai na mediana', () => {
    const almostFull = { boxVolumeM3: '0.099999', quantity: '1', unitsPerBox: 1 }
    const fiveUnmeasured = { boxVolumeM3: null, quantity: '5', unitsPerBox: 1 }
    expect(
      resolveDocumentCargoEstimate({
        items: [almostFull, fiveUnmeasured],
        medianBoxVolumeM3: COMPANY_MEDIAN,
        volumeFactor: '0.100000',
        volumeQuantity: '1.00001',
      }),
    ).toEqual({
      estimateSource: 'median',
      source: 'partial',
      unmeasuredBoxCount: 5,
      unmeasuredBoxVolumeM3: COMPANY_MEDIAN,
      volumeM3: '0.279999',
    })
  })

  /**
   * Medido acima do total e sem mediana: a nota vale o medido, não o total. Total menor que o
   * medido é ocupação menor que a real, e é esse número que faz alguém seguir carregando.
   */
  test('medido acima do total sem mediana vale o medido, com as caixas sem ficha em aberto', () => {
    expect(
      resolveDocumentCargoEstimate({
        items: [measuredLine, { boxVolumeM3: null, quantity: '2', unitsPerBox: 1 }],
        medianBoxVolumeM3: null,
        volumeFactor: SPECIES_FACTOR,
        volumeQuantity: '2',
      }),
    ).toEqual({
      estimateSource: 'none',
      source: 'partial',
      unmeasuredBoxCount: 2,
      unmeasuredBoxVolumeM3: null,
      volumeM3: '0.160000',
    })
  })

  test('linha medida sem total e sem mediana deixa a nota sem volume, como hoje', () => {
    expect(
      resolveDocumentCargoEstimate({
        items: [measuredLine, unmeasuredLine],
        medianBoxVolumeM3: null,
        volumeFactor: null,
        volumeQuantity: null,
      }),
    ).toEqual({
      estimateSource: 'none',
      source: null,
      unmeasuredBoxCount: 6,
      unmeasuredBoxVolumeM3: null,
      volumeM3: null,
    })
  })

  test('as caixas presumidas somadas fecham com o total da nota dentro de meio µm³ por caixa', () => {
    const estimate = resolveDocumentCargoEstimate({
      items: [measuredLine, { boxVolumeM3: null, quantity: '7', unitsPerBox: 1 }],
      medianBoxVolumeM3: COMPANY_MEDIAN,
      volumeFactor: SPECIES_FACTOR,
      volumeQuantity: '11',
    })
    const box = Number(estimate.unmeasuredBoxVolumeM3)
    const drawn = Number(MEASURED_BOX) * 4 + box * estimate.unmeasuredBoxCount
    expect(estimate.volumeM3).toBe('0.550000')
    expect(Math.abs(drawn - 0.55)).toBeLessThanOrEqual(estimate.unmeasuredBoxCount * 0.0000005)
  })
})
