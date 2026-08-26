/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { readVehicleDocument } from '@/modules/document-intake/shared/documentIntake.service'

import {
  buildLabelledColumns,
  buildTextPdf,
  CDT_FOOTER_PLACEMENT,
  CRLV_TITLE_PLACEMENT,
  getLegacyDocument,
  type PdfTextPlacement,
} from './crlv-pdf.helper'

const VALID_RENAVAM = '00123456789'
const VALID_CPF = '111.444.777-35'

function buildCrlv(
  overrides: Readonly<Record<string, string>> = {},
  extra: readonly PdfTextPlacement[] = [],
): Uint8Array {
  const printed: Readonly<Record<string, string>> = {
    'ANO MODELO': '2021',
    CARROCERIA: 'FURGAO',
    'CODIGO RENAVAM': VALID_RENAVAM,
    COMBUSTIVEL: 'ALCOOL/GASOLINA',
    'COR PREDOMINANTE': 'BRANCA',
    'CPF / CNPJ': VALID_CPF,
    EIXOS: '2',
    'MARCA / MODELO / VERSAO': 'FIAT/FIORINO ENDURANCE 1.4',
    'MUNICIPIO / UF': 'SAO PAULO / SP',
    NOME: 'MARIA DE SOUSA',
    PLACA: 'GCQ8E47',
    ...overrides,
  }

  const columns = Object.entries(printed).map(([label, value], index) => ({
    label,
    value,
    x: 60 + (index % 3) * 170,
    y: 700 - Math.floor(index / 3) * 40,
  }))

  return buildTextPdf([
    CRLV_TITLE_PLACEMENT,
    ...buildLabelledColumns(columns),
    CDT_FOOTER_PLACEMENT,
    ...extra,
  ])
}

async function read(data: Uint8Array) {
  return readVehicleDocument({ data, getDocument: getLegacyDocument })
}

describe('o CRLV preenche a ficha do veículo', () => {
  it('reconhece o documento pelo título, mesmo com a palavra CNH no rodapé', async () => {
    const result = await read(buildCrlv())

    expect(result.kind).toBe('crlv')
  })

  it('preenche os campos que o documento diz', async () => {
    const result = await read(buildCrlv())

    expect(result.values).toMatchObject({
      axleCount: '2',
      bodyType: '02',
      brand: 'FIAT',
      color: 'branca',
      fuelType: 'etanol-hidratado',
      model: 'FIORINO ENDURANCE 1.4',
      modelYear: '2021',
      ownerName: 'MARIA DE SOUSA',
      ownerTaxId: '11144477735',
      plate: 'GCQ8E47',
      renavam: VALID_RENAVAM,
      secondaryFuelType: 'gasolina-comum',
      state: 'SP',
    })
  })

  /** Capacidade é peso bruto menos tara, e o CRLV não imprime a tara: metade da conta falta. */
  it('não preenche capacidade, e diz por quê', async () => {
    const result = await read(buildCrlv())

    expect(result.values).not.toHaveProperty('capacityKilograms')
    expect(result.remarks).toContainEqual({
      field: 'capacityKilograms',
      reason: 'notPrinted',
    })
  })

  it('o asterisco em eixos vira campo vazio, nunca zero', async () => {
    const result = await read(buildCrlv({ EIXOS: '*' }))

    expect(result.values).not.toHaveProperty('axleCount')
    expect(result.remarks).toContainEqual({ field: 'axleCount', reason: 'notInformed' })
  })

  it('CPF cujo dígito não fecha não entra no formulário', async () => {
    const result = await read(buildCrlv({ 'CPF / CNPJ': '111.444.777-34' }))

    expect(result.values).not.toHaveProperty('ownerTaxId')
    expect(result.remarks).toContainEqual({ field: 'ownerTaxId', reason: 'checkDigitFailed' })
  })

  it('diesel entra com o padrão da frota e com a ressalva de S10 contra S500', async () => {
    const result = await read(buildCrlv({ COMBUSTIVEL: 'DIESEL' }))

    expect(result.values.fuelType).toBe('diesel-s10')
    expect(result.remarks).toContainEqual({ field: 'fuelType', reason: 'ambiguousDiesel' })
  })

  it('cor fora do nosso catálogo fica vazia com o motivo', async () => {
    const result = await read(buildCrlv({ 'COR PREDOMINANTE': 'PRATA METALICO' }))

    expect(result.values).not.toHaveProperty('color')
    expect(result.remarks).toContainEqual({ field: 'color', reason: 'notInCatalog' })
  })

  it('PDF sem camada de texto é imagem digitalizada, não documento desconhecido', async () => {
    const result = await read(buildTextPdf([]))

    expect(result.kind).toBe('scanned')
    expect(result.values).toEqual({})
  })

  /** A palavra solta é o classificador errado; o título é o certo — e o inverso vale também. */
  it('página com a palavra CNH e sem título conhecido é documento desconhecido', async () => {
    const result = await read(buildTextPdf([CDT_FOOTER_PLACEMENT]))

    expect(result.kind).toBe('unknown')
    expect(result.values).toEqual({})
  })

  it('o título fora do topo da página não identifica o documento', async () => {
    const result = await read(buildTextPdf([{ ...CRLV_TITLE_PLACEMENT, y: 200 }]))

    expect(result.kind).toBe('unknown')
  })
})
