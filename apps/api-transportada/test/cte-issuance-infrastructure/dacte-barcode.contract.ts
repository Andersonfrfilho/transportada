/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import bwipjs from 'bwip-js/node'

import {
  ACCESS_KEY_SYMBOLOGY,
  createDacteBarcodeGateway,
} from '../../src/cte-issuance/infrastructure/dacte-barcode.gateway.js'
import {
  ALPHANUMERIC_CTE_ACCESS_KEY,
  SYNTHETIC_CTE_ACCESS_KEY,
} from '../fixtures/cte-xml.fixture.js'

/**
 * Tabela de padrões do Code 128 (ISO/IEC 15417), valores 0 a 105: três barras e três espaços por
 * caractere, em módulos. Ela é a referência **externa** deste contrato — o decodificador abaixo não
 * pode ser derivado do bwip-js, ou provaria só que o gerador concorda consigo mesmo. Quem a
 * confere é o caso numérico: uma entrada errada faz a chave de 44 dígitos decodificar em lixo, e o
 * dígito verificador do símbolo não fecha.
 */
// prettier-ignore
const CODE_128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232',
] as const

const STOP_PATTERN = '2331112'
const ELEMENTS_PER_SYMBOL = 6
const CODE_128_MODULUS = 103
const START_CODES: Readonly<Record<number, CodeSet>> = { 103: 'A', 104: 'B', 105: 'C' }
const SWITCH_CODES: Readonly<Record<number, CodeSet>> = { 99: 'C', 100: 'B', 101: 'A' }

type CodeSet = 'A' | 'B' | 'C'

type DecodedSymbol = {
  readonly codeSets: readonly CodeSet[]
  readonly text: string
}

function readSymbolValues(bars: readonly number[]): readonly number[] {
  expect(bars.slice(-STOP_PATTERN.length).join(''), 'caractere de parada').toBe(STOP_PATTERN)
  const body = bars.slice(0, -STOP_PATTERN.length)
  expect(body.length % ELEMENTS_PER_SYMBOL, 'módulos por caractere').toBe(0)

  const values: number[] = []
  for (let index = 0; index < body.length; index += ELEMENTS_PER_SYMBOL) {
    const pattern = body.slice(index, index + ELEMENTS_PER_SYMBOL).join('')
    const value = CODE_128_PATTERNS.indexOf(pattern as (typeof CODE_128_PATTERNS)[number])
    expect(value, `padrão fora da tabela: ${pattern}`).toBeGreaterThan(-1)
    values.push(value)
  }
  return values
}

function decodeCode128(bars: readonly number[]): DecodedSymbol {
  const values = readSymbolValues(bars)
  const start = values.at(0) ?? -1
  const checkCharacter = values.at(-1) ?? -1
  const payload = values.slice(1, -1)

  const computedCheck =
    (start + payload.reduce((sum, value, index) => sum + value * (index + 1), 0)) % CODE_128_MODULUS
  expect(computedCheck, 'dígito verificador do símbolo').toBe(checkCharacter)

  let codeSet = START_CODES[start]
  expect(codeSet, `caractere de início desconhecido: ${start}`).toBeDefined()

  const codeSets: CodeSet[] = [codeSet as CodeSet]
  let text = ''
  for (const value of payload) {
    const switched = SWITCH_CODES[value]
    if (switched !== undefined && switched !== codeSet) {
      codeSet = switched
      codeSets.push(switched)
      continue
    }
    if (codeSet === 'C') {
      text += String(value).padStart(2, '0')
      continue
    }
    text += String.fromCharCode(value < 64 ? value + 32 : value - 64)
  }
  return { codeSets, text }
}

function encodeAccessKey(accessKey: string): readonly number[] {
  const symbols = bwipjs.raw({ bcid: ACCESS_KEY_SYMBOLOGY, text: accessKey }) as ReadonlyArray<{
    readonly sbs: number[]
  }>
  const symbol = symbols.at(0)
  if (symbol === undefined) throw new Error('bwip-js did not encode the access key')
  return symbol.sbs
}

describe('dacte barcode gateway contract', () => {
  test('draws the numeric key entirely in Code Set C, as the MOC asks', () => {
    const decoded = decodeCode128(encodeAccessKey(SYNTHETIC_CTE_ACCESS_KEY))

    expect(decoded.text).toBe(SYNTHETIC_CTE_ACCESS_KEY)
    expect(decoded.codeSets).toEqual(['C'])
  })

  /**
   * Item 6 da NT Conjunta DF-e 2025.001: o CODE-128C não é compatível com a chave alfanumérica, e a
   * norma publica a alternância de Code Set. O contrato prova que o desenho alterna e volta a fechar
   * na chave inteira — confiar na observação de que "o bwip-js faz isso" não é evidência.
   */
  test('alternates Code Set on the alphanumeric key and still decodes to the whole key', () => {
    const decoded = decodeCode128(encodeAccessKey(ALPHANUMERIC_CTE_ACCESS_KEY))

    expect(decoded.text).toBe(ALPHANUMERIC_CTE_ACCESS_KEY)
    expect(decoded.codeSets.length).toBeGreaterThan(1)
    expect(new Set(decoded.codeSets)).toEqual(new Set<CodeSet>(['B', 'C']))
  })

  test('renders both keys as a PNG the printer can place on the DACTE', async () => {
    const gateway = createDacteBarcodeGateway()

    for (const key of [SYNTHETIC_CTE_ACCESS_KEY, ALPHANUMERIC_CTE_ACCESS_KEY]) {
      const image = await gateway.renderAccessKey(key)
      expect(image.byteLength, key).toBeGreaterThan(0)
      expect(image.subarray(1, 4).toString('ascii'), key).toBe('PNG')
    }
  })
})
