/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF4/T4.3: a linha da prévia lida por NOME de coluna, normalizada, e com erro por linha —
 * nunca da planilha inteira. Cabeçalho de rota e linha vazia são ignorados, não são erro.
 */
import { describe, expect, test } from 'bun:test'

import { CargoPreviewWorkbookError } from '../../src/cargo-receiving/domain/cargo-preview-workbook.error.js'
import { parseCargoPreviewWorkbook } from '../../src/cargo-receiving/domain/cargo-preview-workbook.parser.js'
import {
  buildCargoPreviewWorkbook,
  FR_COLUMN_MAP,
  FR_HEADER,
  IMPORT_SHEET_NAME,
  type BuildWorkbookOptions,
  type FixtureRow,
} from '../fixtures/cargo-preview-workbook.fixture.js'

const ROUTE_HEADER: FixtureRow = { RouteName: 'FR.S.CAR', RoutingDate: 46297 }
const ITEM: FixtureRow = {
  City: 'São Carlos',
  Comment16: ' CENTRO ',
  Company: 42647,
  CompanyName: 'Destinatário 001',
  ENDEREÇO: 'RUA UM, 10',
  'PESO TOTAL': 138.69999999999999,
  PostalCode: '13560-000',
  RouteName: 'FR.S.CAR',
  RoutingDate: 46297,
  State: 'sp',
  Text001: 815358,
  VALOR: 1780.62,
  'VOLUME(M3)': 0.26,
}
const EXPECTED_ITEM = {
  address: 'RUA UM, 10',
  city: 'SAO CARLOS',
  contractorReference: '815358',
  neighborhood: 'CENTRO',
  postalCode: '13560000',
  recipientCode: '42647',
  recipientName: 'Destinatário 001',
  routeName: 'FR.S.CAR',
  routingDate: '2026-10-02',
  rowNumber: 6,
  state: 'SP',
  value: '1780.62',
  volumeM3: '0.2600',
  weightKg: '138.700',
}

function read(options: BuildWorkbookOptions, columnMap: Record<string, string> = FR_COLUMN_MAP) {
  return parseCargoPreviewWorkbook({
    bytes: buildCargoPreviewWorkbook({ reservedEmptyRows: 20, ...options }),
    clock: () => performance.now(),
    columnMap,
    sheetName: IMPORT_SHEET_NAME,
  })
}

function errorOf(action: () => unknown): CargoPreviewWorkbookError {
  try {
    action()
  } catch (error) {
    if (error instanceof CargoPreviewWorkbookError) return error
    throw error
  }
  throw new Error('EXPECTED_CARGO_PREVIEW_WORKBOOK_ERROR')
}

function errorsOf(row: FixtureRow) {
  return read({ rows: [row] }).rowErrors.map(({ column, field }) => ({ column, field }))
}

describe('a linha da prévia (spec 237 RF4, T4.3)', () => {
  test('lê por nome de coluna, normaliza e ignora o cabeçalho de rota e as linhas vazias', () => {
    const result = read({ rows: [ROUTE_HEADER, ITEM, {}, ROUTE_HEADER] })
    expect(result.rows).toEqual([EXPECTED_ITEM])
    expect(result.rowErrors).toEqual([])
  })

  test('colunas reordenadas dão o mesmo resultado', () => {
    const header = [...FR_HEADER].reverse()
    expect(read({ header, rows: [ROUTE_HEADER, ITEM] }).rows).toEqual([EXPECTED_ITEM])
  })

  test('o nome da coluna compara sem caixa e sem espaço nas pontas; o cabeçalho é achado sozinho', () => {
    const header = FR_HEADER.map((column) => (column === 'VALOR' ? ' valor ' : column))
    const rows = [ROUTE_HEADER, { ...ITEM, ' valor ': 1780.62 }]
    const result = read({ header, headerRowNumber: 9, rows })
    expect(result.rows).toEqual([{ ...EXPECTED_ITEM, rowNumber: 11 }])
  })

  test('cabeçalho fora das 20 primeiras linhas não é achado', () => {
    expect(errorOf(() => read({ headerRowNumber: 21, rows: [ITEM] })).code).toBe(
      'PREVIEW_COLUMN_NOT_FOUND',
    )
  })

  test('toda coluna mapeada ausente é nomeada, de uma vez', () => {
    const header = FR_HEADER.filter((column) => column !== 'City' && column !== 'Comment16')
    const error = errorOf(() => read({ header, rows: [ITEM] }))
    expect(error.code).toBe('PREVIEW_COLUMN_NOT_FOUND')
    expect(error.details?.map((detail) => detail.field)).toEqual(['City', 'Comment16'])
  })

  test('coluna repetida no cabeçalho é recusada, não escolhida em silêncio', () => {
    expect(errorOf(() => read({ header: [...FR_HEADER, 'VALOR'], rows: [ITEM] })).code).toBe(
      'PREVIEW_COLUMN_DUPLICATED',
    )
  })

  test('só o mínimo mapeado (rota, valor, peso) basta', () => {
    const columnMap = { routeName: 'RouteName', value: 'VALOR', weightKg: 'PESO TOTAL' }
    const [row] = read({ rows: [ITEM] }, columnMap).rows
    expect(row).toEqual({
      address: undefined,
      city: undefined,
      contractorReference: undefined,
      neighborhood: undefined,
      postalCode: undefined,
      recipientCode: undefined,
      recipientName: undefined,
      routeName: 'FR.S.CAR',
      routingDate: undefined,
      rowNumber: 5,
      state: undefined,
      value: '1780.62',
      volumeM3: undefined,
      weightKg: '138.700',
    })
  })

  test.each([
    ['vírgula decimal em texto', { VALOR: '1780,62', 'PESO TOTAL': '138,7' }, '1780.62', '138.700'],
    ['ponto decimal em texto', { VALOR: '1780.62', 'PESO TOTAL': ' 138.7 ' }, '1780.62', '138.700'],
    [
      'notação científica do Excel',
      { VALOR: { raw: '1.78062E3' }, 'PESO TOTAL': { raw: '1.0000000000000001E-2' } },
      '1780.62',
      '0.010',
    ],
    ['zero', { VALOR: 0, 'PESO TOTAL': 0 }, '0.00', '0.000'],
    [
      'meio centavo arredonda para cima',
      { VALOR: '0.005', 'PESO TOTAL': '0.0005' },
      '0.01',
      '0.001',
    ],
  ])('número: %s', (_label, cells, value, weightKg) => {
    const [row] = read({ rows: [{ ...ITEM, ...cells }] }).rows
    expect([row?.value, row?.weightKg]).toEqual([value, weightKg])
  })

  test.each([
    ['valor negativo', { VALOR: -1 }, 'value'],
    ['peso negativo', { 'PESO TOTAL': '-0,5' }, 'weightKg'],
    ['valor não numérico', { VALOR: 'abc' }, 'value'],
    ['valor com milhar e decimal (ambíguo)', { VALOR: '1.780,62' }, 'value'],
    ['valor infinito', { VALOR: { raw: '1E+400' } }, 'value'],
    ['notação científica em texto', { VALOR: '1E3' }, 'value'],
    ['valor ausente', { VALOR: undefined }, 'value'],
    ['valor com erro de fórmula', { VALOR: { error: '#NAME?' } }, 'value'],
    ['rota ausente numa linha de item', { RouteName: undefined }, 'routeName'],
    ['volume negativo', { 'VOLUME(M3)': -2 }, 'volumeM3'],
  ])('%s vira erro da linha', (_label, cells, field) => {
    expect(errorsOf({ ...ITEM, ...cells }).map((error): string => error.field)).toEqual([field])
  })

  test('o erro nomeia a coluna, todos os erros da linha saem juntos, e as demais linhas seguem', () => {
    const result = read({ rows: [ITEM, { ...ITEM, 'PESO TOTAL': 'x', VALOR: -3 }, ITEM] })
    expect(result.rows.map((row) => row.rowNumber)).toEqual([5, 7])
    expect(
      result.rowErrors.map(({ column, field, rowNumber }) => ({ column, field, rowNumber })),
    ).toEqual([
      { column: 'PESO TOTAL', field: 'weightKg', rowNumber: 6 },
      { column: 'VALOR', field: 'value', rowNumber: 6 },
    ])
    expect(result.rowErrors.every((error) => error.message.length > 0)).toBe(true)
  })

  test.each([
    [46297, '2026-10-02'],
    [46297.75, '2026-10-02'],
    [59, '1900-02-28'],
    [61, '1900-03-01'],
    [1, '1900-01-01'],
    ['2026-10-02', '2026-10-02'],
  ])('data do roteiro %p vira %s (sistema 1900, com o 29/02/1900 do Excel)', (serial, expected) => {
    expect(read({ rows: [{ ...ITEM, RoutingDate: serial }] }).rows[0]?.routingDate).toBe(expected)
  })

  test.each([60, 0, -5, '02/10/2026', 'amanhã'])('data inválida %p é erro da linha', (serial) => {
    expect(errorsOf({ ...ITEM, RoutingDate: serial })).toEqual([
      { column: 'RoutingDate', field: 'routingDate' },
    ])
  })

  test.each([
    ['13560-000', '13560000'],
    ['13.560-000', '13560000'],
    [1310100, '01310100'],
  ])('CEP %p vira %s', (postalCode, expected) => {
    expect(read({ rows: [{ ...ITEM, PostalCode: postalCode }] }).rows[0]?.postalCode).toBe(expected)
  })

  test.each(['123', '1356000000', 'ABCDEFGH'])('CEP %p é erro da linha', (postalCode) => {
    expect(errorsOf({ ...ITEM, PostalCode: postalCode })).toEqual([
      { column: 'PostalCode', field: 'postalCode' },
    ])
  })

  test('UF que não é sigla é erro; cidade perde acento e vai para caixa alta', () => {
    expect(errorsOf({ ...ITEM, State: 'São Paulo' })).toEqual([{ column: 'State', field: 'state' }])
    expect(read({ rows: [{ ...ITEM, City: '  ribeirão  preto ' }] }).rows[0]?.city).toBe(
      'RIBEIRAO PRETO',
    )
  })

  test('texto longo demais é erro do campo', () => {
    expect(errorsOf({ ...ITEM, CompanyName: 'N'.repeat(201) })).toEqual([
      { column: 'CompanyName', field: 'recipientName' },
    ])
  })

  test('erro de fórmula em coluna opcional é ausência, não erro', () => {
    const [row] = read({ rows: [{ ...ITEM, Comment16: { error: '#NAME?' } }] }).rows
    expect(row?.neighborhood).toBeUndefined()
  })

  test('fórmula nunca é avaliada: vale o valor em cache', () => {
    const rows = [
      {
        ...ITEM,
        CompanyName: { cached: 'Em cache', formula: '"Avaliada"' },
        VALOR: { cached: 5, formula: '1+1' },
      },
    ]
    const [row] = read({ rows }).rows
    expect([row?.value, row?.recipientName]).toEqual(['5.00', 'Em cache'])
  })

  test('string inline também é lida', () => {
    const [row] = read({ rows: [{ ...ITEM, RouteName: { inline: 'FR.MATAO' } }] }).rows
    expect(row?.routeName).toBe('FR.MATAO')
  })

  test('a primeira aba é usada quando o perfil não diz qual', () => {
    const result = parseCargoPreviewWorkbook({
      bytes: buildCargoPreviewWorkbook({ reservedEmptyRows: 5, rows: [ITEM] }),
      clock: () => performance.now(),
      columnMap: FR_COLUMN_MAP,
      sheetName: null,
    })
    expect(result.rows).toHaveLength(1)
  })
})
