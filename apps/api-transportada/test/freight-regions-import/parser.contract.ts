/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { parseFreightRegionCsv } from '../../src/freight-regions/domain/freight-region-csv.parser.js'

const REGIONS_CSV = [
  'code,name,zone,city,state',
  '1.000,BARRETOS,1,BARRETOS,SP',
  '1.000,BARRETOS,1,BARRINHA,SP',
  '5.000,JABOTICABAL,1,BARRINHA,SP',
].join('\n')

const RATES_CSV = [
  'code,utility,van,vuc,three_quarter,toco,truck',
  '1.000,0.00,540.00,621.00,695.52,848.53,1086.12',
  '5.000,0.00,480.00,552.00,618.24,754.25,965.44',
].join('\n')

describe('freight region csv parser', () => {
  /**
   * O arquivo do cliente traz uma linha por cidade; a rota é a mesma. Dobrar aqui é o que faz a
   * chave natural `(company_id, code)` valer — 84 linhas viram 29 rotas.
   */
  test('folds the city rows of a code into one region and joins the rates by column', () => {
    const regions = parseFreightRegionCsv({ rates: RATES_CSV, regions: REGIONS_CSV })

    expect(regions).toEqual([
      {
        cities: [
          { city: 'BARRETOS', state: 'SP' },
          { city: 'BARRINHA', state: 'SP' },
        ],
        code: '1.000',
        name: 'BARRETOS',
        rates: [
          { driverAmount: '695.5200', freightClass: 'three_quarter' },
          { driverAmount: '848.5300', freightClass: 'toco' },
          { driverAmount: '1086.1200', freightClass: 'truck' },
          { driverAmount: '540.0000', freightClass: 'van' },
          { driverAmount: '621.0000', freightClass: 'vuc' },
        ],
      },
      {
        cities: [{ city: 'BARRINHA', state: 'SP' }],
        code: '5.000',
        name: 'JABOTICABAL',
        rates: [
          { driverAmount: '618.2400', freightClass: 'three_quarter' },
          { driverAmount: '754.2500', freightClass: 'toco' },
          { driverAmount: '965.4400', freightClass: 'truck' },
          { driverAmount: '480.0000', freightClass: 'van' },
          { driverAmount: '552.0000', freightClass: 'vuc' },
        ],
      },
    ])
  })

  /**
   * `0,00` na planilha é classe que não roda a rota, não pagamento de zero real. Guardar o zero
   * faria a tela oferecer utilitário para Barretos e o financeiro pagar nada por ele.
   */
  test('drops the zero rate: a class without value does not run the route', () => {
    const [region] = parseFreightRegionCsv({ rates: RATES_CSV, regions: REGIONS_CSV })

    expect(region?.rates.some((rate) => rate.freightClass === 'utility')).toBe(false)
  })

  /** A zona sai do código; a coluna do arquivo é conferência, e discordar é erro de transcrição. */
  test('derives the zone from the code and refuses a zone column that disagrees', () => {
    const wrongZone = REGIONS_CSV.replace(
      '1.000,BARRETOS,1,BARRETOS,SP',
      '1.000,BARRETOS,3,BARRETOS,SP',
    )

    expect(() => parseFreightRegionCsv({ rates: RATES_CSV, regions: wrongZone })).toThrow(
      expect.objectContaining({ code: 'FREIGHT_REGION_IMPORT_INVALID' }),
    )
  })

  test('refuses the same code with two names', () => {
    const twoNames = REGIONS_CSV.replace(
      '1.000,BARRETOS,1,BARRINHA,SP',
      '1.000,BARRETOS ZONA 1,1,BARRINHA,SP',
    )

    expect(() => parseFreightRegionCsv({ rates: RATES_CSV, regions: twoNames })).toThrow(
      expect.objectContaining({ code: 'FREIGHT_REGION_IMPORT_INVALID' }),
    )
  })

  /** Valor sem rota é linha órfã: aceitar em silêncio esconderia o código digitado errado. */
  test('refuses a rate row whose code has no region', () => {
    const orphanRate = `${RATES_CSV}\n9.000,0.00,100.00,0.00,0.00,0.00,0.00`

    expect(() => parseFreightRegionCsv({ rates: orphanRate, regions: REGIONS_CSV })).toThrow(
      expect.objectContaining({ code: 'FREIGHT_REGION_IMPORT_INVALID' }),
    )
  })

  test('refuses a duplicated city inside the same region', () => {
    const duplicated = `${REGIONS_CSV}\n1.000,BARRETOS,1,barrinha,sp`

    expect(() => parseFreightRegionCsv({ rates: RATES_CSV, regions: duplicated })).toThrow(
      expect.objectContaining({ code: 'FREIGHT_REGION_IMPORT_INVALID' }),
    )
  })

  /**
   * A vírgula decimal da planilha brasileira convive com o ponto de milhar: `1.086,12` e `1.086`
   * são o mesmo texto até o fim do campo. Uma forma só, e a recusa diz qual é.
   */
  test('refuses a money value written with the spreadsheet comma', () => {
    const comma = RATES_CSV.replace('540.00', '540,00')

    expect(() => parseFreightRegionCsv({ rates: comma, regions: REGIONS_CSV })).toThrow(
      expect.objectContaining({ code: 'FREIGHT_REGION_IMPORT_INVALID' }),
    )
  })

  test('refuses a header that is not the one printed in the file', () => {
    const missingColumn = REGIONS_CSV.replace('code,name,zone,city,state', 'code,name,city,state')

    expect(() => parseFreightRegionCsv({ rates: RATES_CSV, regions: missingColumn })).toThrow(
      expect.objectContaining({ code: 'FREIGHT_REGION_IMPORT_INVALID' }),
    )
  })

  /** Arquivo salvo pelo Excel: BOM na frente, CRLF na quebra e linha vazia no fim. */
  test('reads a file exported by a spreadsheet', () => {
    const exported = `\uFEFF${REGIONS_CSV.replace(/\n/g, '\r\n')}\r\n`
    const exportedRates = `\uFEFF${RATES_CSV.replace(/\n/g, '\r\n')}\r\n`

    expect(parseFreightRegionCsv({ rates: exportedRates, regions: exported })).toHaveLength(2)
  })

  /** Campo entre aspas: cidade com vírgula no nome não pode partir a linha em duas colunas. */
  test('reads a quoted field with a comma inside', () => {
    const quoted = 'code,name,zone,city,state\n1.000,"BARRETOS, SP",1,BARRETOS,SP'
    const rates =
      'code,utility,van,vuc,three_quarter,toco,truck\n1.000,0.00,540.00,0.00,0.00,0.00,0.00'

    expect(parseFreightRegionCsv({ rates, regions: quoted })[0]?.name).toBe('BARRETOS, SP')
  })

  /**
   * Arquivo só com cabeçalho inativaria a tabela inteira em silêncio — e a tabela é o que o
   * motorista está ligado. Recusar é a única leitura segura de um upload que veio errado.
   */
  test('refuses a file with no region at all', () => {
    expect(() =>
      parseFreightRegionCsv({
        rates: 'code,utility,van,vuc,three_quarter,toco,truck',
        regions: 'code,name,zone,city,state',
      }),
    ).toThrow(expect.objectContaining({ code: 'FREIGHT_REGION_IMPORT_EMPTY' }))
  })
})
