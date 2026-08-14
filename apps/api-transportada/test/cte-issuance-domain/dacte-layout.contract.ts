/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  formatDacteAccessKey,
  formatDacteAmount,
  formatDacteDateTime,
  formatDacteDocumentNumber,
} from '../../src/cte-issuance/domain/dacte-format.policy.js'
import {
  buildDacteLayout,
  DACTE_HOMOLOGATION_LEGEND,
} from '../../src/cte-issuance/domain/dacte-layout.policy.js'
import type { DacteDocument } from '../../src/cte-issuance/domain/dacte.types.js'
import { parseCteXmlForDacte } from '../../src/cte-issuance/infrastructure/cte-xml.mapper.js'
import {
  ALPHANUMERIC_CTE_ACCESS_KEY,
  buildSyntheticCteXml,
  SYNTHETIC_CTE_ACCESS_KEY,
  SYNTHETIC_ICMS00_BLOCK,
} from '../fixtures/cte-xml.fixture.js'

function sectionTitles(document: DacteDocument): readonly string[] {
  return buildDacteLayout(document).sections.map((section) => section.title)
}

function findSection(document: DacteDocument, title: string) {
  const section = buildDacteLayout(document).sections.find((item) => item.title === title)
  if (section === undefined) throw new Error(`section ${title} is missing`)
  return section
}

function fieldValue(document: DacteDocument, title: string, label: string): string {
  const field = findSection(document, title)
    .rows.flatMap((row) => row.fields)
    .find((item) => item.label === label)
  if (field === undefined) throw new Error(`field ${label} is missing in ${title}`)
  return field.value
}

const SYNTHETIC = parseCteXmlForDacte(buildSyntheticCteXml())

describe('formatDacteAmount', () => {
  test('groups thousands without ever turning the decimal into a float', () => {
    expect(formatDacteAmount('1250.75')).toBe('1.250,75')
    expect(formatDacteAmount('48000.00')).toBe('48.000,00')
    expect(formatDacteAmount('0.5')).toBe('0,50')
    expect(formatDacteAmount('7')).toBe('7,00')
    expect(formatDacteAmount('99999999999999999999.99')).toBe('99.999.999.999.999.999.999,99')
  })

  test('keeps a value it cannot read as is instead of printing NaN', () => {
    expect(formatDacteAmount('')).toBe('')
    expect(formatDacteAmount('n/d')).toBe('n/d')
  })
})

describe('formatDacteDateTime', () => {
  test('prints the instant the emitter declared, without shifting the time zone', () => {
    expect(formatDacteDateTime('2026-07-28T02:14:59-03:00')).toBe('28/07/2026 02:14:59')
    expect(formatDacteDateTime('2026-07-30')).toBe('30/07/2026')
  })
})

describe('formatDacteAccessKey', () => {
  test('breaks the key into groups of four, the way the DACTE prints it', () => {
    expect(formatDacteAccessKey(SYNTHETIC_CTE_ACCESS_KEY)).toBe(
      '3526 0700 0000 0000 0191 5700 1000 0000 0110 0000 0010',
    )
  })

  test('groups an alphanumeric key without dropping a single character', () => {
    expect(formatDacteAccessKey(ALPHANUMERIC_CTE_ACCESS_KEY)).toBe(
      '3526 0812 ABC3 4501 DE35 5700 1000 0000 0110 0000 0017',
    )
  })
})

describe('formatDacteDocumentNumber', () => {
  test('punctuates the alphanumeric CNPJ in the positions the IN publishes', () => {
    expect(formatDacteDocumentNumber('12ABC34501DE35')).toBe('12.ABC.345/01DE-35')
  })

  test('keeps punctuating the numeric CNPJ and the CPF', () => {
    expect(formatDacteDocumentNumber('61156864000191')).toBe('61.156.864/0001-91')
    expect(formatDacteDocumentNumber('12345678909')).toBe('123.456.789-09')
  })

  /**
   * Um CNPJ com três letras deixa onze dígitos ao ser filtrado — o comprimento do CPF. A guarda tem
   * de ser de conjunto: o documento inteiro, não o que sobra depois de apagar as letras.
   */
  test('never prints a CNPJ with three letters under a CPF mask', () => {
    expect(formatDacteDocumentNumber('12ABC345000135')).toBe('12.ABC.345/0001-35')
  })

  test('prints what it does not recognize exactly as it came', () => {
    expect(formatDacteDocumentNumber('SEM DOCUMENTO')).toBe('SEM DOCUMENTO')
    expect(formatDacteDocumentNumber('')).toBe('')
  })
})

describe('buildDacteLayout', () => {
  test('carries the barcode and QR Code values the inspector scans', () => {
    const layout = buildDacteLayout(SYNTHETIC)

    expect(layout.barcodeValue).toBe(SYNTHETIC_CTE_ACCESS_KEY)
    expect(layout.accessKeyGrouped).toContain('3526 0700')
    expect(layout.qrCodeValue).toContain(SYNTHETIC_CTE_ACCESS_KEY)
  })

  test('warns that a homologation document has no fiscal value', () => {
    expect(buildDacteLayout(SYNTHETIC).legend).toBe(DACTE_HOMOLOGATION_LEGEND)
  })

  test('omits the warning once the document is authorized in production', () => {
    const production = parseCteXmlForDacte(
      buildSyntheticCteXml().replace('<tpAmb>2</tpAmb>', '<tpAmb>1</tpAmb>'),
    )

    expect(buildDacteLayout(production).legend).toBeUndefined()
  })

  test('identifies the emitter and the authorization protocol', () => {
    const layout = buildDacteLayout(SYNTHETIC)

    expect(layout.emitter.lines[0]).toBe('Transportadora Sintetica Ltda')
    expect(layout.emitter.lines.join(' ')).toContain('Rodovia dos Contratos')
    expect(layout.protocol).toBe('135260000000001 - 28/07/2026 02:15:04')
    expect(layout.number).toBe('1')
    expect(layout.series).toBe('1')
  })

  test('lays out only the party quadros the CT-e actually declared', () => {
    expect(sectionTitles(SYNTHETIC)).toContain('REMETENTE')
    expect(sectionTitles(SYNTHETIC)).toContain('DESTINATÁRIO')
    expect(sectionTitles(SYNTHETIC)).toContain('TOMADOR DO SERVIÇO')
    expect(sectionTitles(SYNTHETIC)).not.toContain('EXPEDIDOR')
    expect(sectionTitles(SYNTHETIC)).not.toContain('RECEBEDOR')
  })

  test('describes the service being provided', () => {
    expect(fieldValue(SYNTHETIC, 'PRESTAÇÃO DO SERVIÇO', 'ORIGEM')).toBe('Sao Paulo - SP')
    expect(fieldValue(SYNTHETIC, 'PRESTAÇÃO DO SERVIÇO', 'DESTINO')).toBe('Rio de Janeiro - RJ')
    expect(fieldValue(SYNTHETIC, 'PRESTAÇÃO DO SERVIÇO', 'CFOP')).toBe('6353')
    expect(fieldValue(SYNTHETIC, 'PRESTAÇÃO DO SERVIÇO', 'TIPO DO SERVIÇO')).toBe('Normal')
    expect(fieldValue(SYNTHETIC, 'PRESTAÇÃO DO SERVIÇO', 'TIPO DO CT-E')).toBe('Normal')
  })

  test('breaks down the freight price and totals it', () => {
    const components = findSection(SYNTHETIC, 'COMPONENTES DO VALOR DA PRESTAÇÃO')
    const labels = components.rows.flatMap((row) => row.fields).map((field) => field.label)

    expect(labels).toContain('FRETE PESO')
    expect(labels).toContain('PEDAGIO')
    expect(fieldValue(SYNTHETIC, 'COMPONENTES DO VALOR DA PRESTAÇÃO', 'FRETE PESO')).toBe(
      '1.100,50',
    )
    expect(fieldValue(SYNTHETIC, 'COMPONENTES DO VALOR DA PRESTAÇÃO', 'VALOR TOTAL')).toBe(
      '1.250,75',
    )
  })

  test('states the tax situation of a Simples Nacional emitter without inventing numbers', () => {
    expect(fieldValue(SYNTHETIC, 'INFORMAÇÕES RELATIVAS AO IMPOSTO', 'SITUAÇÃO TRIBUTÁRIA')).toBe(
      'Simples Nacional (90)',
    )
    expect(fieldValue(SYNTHETIC, 'INFORMAÇÕES RELATIVAS AO IMPOSTO', 'BASE DE CÁLCULO')).toBe('')
    expect(fieldValue(SYNTHETIC, 'INFORMAÇÕES RELATIVAS AO IMPOSTO', 'VALOR DO ICMS')).toBe('')
  })

  test('states the tax numbers of a regular regime emitter', () => {
    const regular = parseCteXmlForDacte(buildSyntheticCteXml({ icms: SYNTHETIC_ICMS00_BLOCK }))

    expect(fieldValue(regular, 'INFORMAÇÕES RELATIVAS AO IMPOSTO', 'BASE DE CÁLCULO')).toBe(
      '1.250,75',
    )
    expect(fieldValue(regular, 'INFORMAÇÕES RELATIVAS AO IMPOSTO', 'ALÍQUOTA ICMS')).toBe('12,00')
    expect(fieldValue(regular, 'INFORMAÇÕES RELATIVAS AO IMPOSTO', 'VALOR DO ICMS')).toBe('150,09')
  })

  test('lists the cargo and the documents the CT-e transports', () => {
    const layout = buildDacteLayout(SYNTHETIC)

    expect(fieldValue(SYNTHETIC, 'INFORMAÇÕES DA CARGA', 'PRODUTO PREDOMINANTE')).toBe(
      'PRODUTO SINTETICO',
    )
    expect(fieldValue(SYNTHETIC, 'INFORMAÇÕES DA CARGA', 'PESO BRUTO')).toBe('1250,0000')
    expect(layout.invoiceKeys).toEqual([
      '35260700000000000272550010000000181000000018',
      '35260700000000000272550010000000191000000027',
    ])
  })

  test('carries the road modal registry and the emitter observations', () => {
    expect(fieldValue(SYNTHETIC, 'MODAL RODOVIÁRIO', 'RNTRC')).toBe('58151044')
    expect(fieldValue(SYNTHETIC, 'OBSERVAÇÕES', 'OBSERVAÇÕES')).toBe(
      'Observacao sintetica do contribuinte',
    )
  })
})
