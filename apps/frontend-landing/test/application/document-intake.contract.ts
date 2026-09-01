/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  readCompanyDocument,
  readVehicleDocument,
} from '@/modules/application/shared/documentIntake.service'

import {
  buildCcmeiPdf,
  buildCrlvPdf,
  buildLabelledColumns,
  buildTextPdf,
  getLegacyDocument,
  CCMEI_TITLE_PLACEMENTS,
} from './ccmei-pdf.helper'

async function read(bytes: Uint8Array) {
  return readCompanyDocument({ data: bytes, getDocument: getLegacyDocument })
}

describe('leitura do documento anexado no navegador', () => {
  test('o CCMEI é reconhecido e preenche o que ele diz', async () => {
    const bytes = buildTextPdf([
      ...CCMEI_TITLE_PLACEMENTS,
      ...buildLabelledColumns([{ label: 'CNPJ', value: '30.213.061/0001-06', x: 60, y: 600 }]),
    ])

    const result = await read(bytes)

    expect(result.kind).toBe('ccmei')
    expect(result.values.cnpj).toBe('30213061000106')
  })

  /**
   * Spec 066: PDF que não é CCMEI anexa como "outro documento" e **não preenche campo nenhum**.
   * Preencher a partir de documento não identificado é inventar dado com aparência de leitura.
   */
  test('PDF que não é CCMEI não preenche campo algum', async () => {
    const bytes = buildTextPdf([
      { size: 12, text: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS', x: 60, y: 790 },
      ...buildLabelledColumns([{ label: 'CNPJ', value: '30.213.061/0001-06', x: 60, y: 600 }]),
    ])

    const result = await read(bytes)

    expect(result.kind).toBe('unknown')
    expect(result.values).toEqual({})
  })

  /** O CRLV é documento conhecido do ecossistema e mesmo assim não é deste formulário. */
  test('CRLV é reconhecido como CRLV e também não preenche a empresa', async () => {
    const bytes = buildTextPdf([
      { size: 12, text: 'CERTIFICADO DE REGISTRO E LICENCIAMENTO DE VEÍCULO', x: 60, y: 790 },
    ])

    const result = await read(bytes)

    expect(result.kind).toBe('crlv')
    expect(result.values).toEqual({})
  })

  /** CCMEI escaneado não tem camada de texto: é `scanned`, anexa, e nada é extraído. */
  test('documento sem camada de texto é escaneado, não desconhecido', async () => {
    const result = await read(buildTextPdf([]))

    expect(result.kind).toBe('scanned')
    expect(result.values).toEqual({})
  })
})

describe('quem manda é o documento, não o campo em que ele foi solto', () => {
  /**
   * Spec 071: um CRLV anexado no campo do documento da empresa não preenche a empresa, e um CCMEI
   * no campo do CRLV não preenche o veículo. Ler com o mapa errado inventa campo, e campo inventado
   * vira divergência falsa contra a ficha do operador.
   */
  test('o CRLV lido pelo leitor de empresa não preenche campo nenhum', async () => {
    const reading = await readCompanyDocument({
      data: buildCrlvPdf(),
      getDocument: getLegacyDocument,
    })

    expect(reading.kind).toBe('crlv')
    expect(reading.values).toEqual({})
    expect(reading.remarks).toEqual([])
  })

  test('o leitor de veículo reconhece o CRLV e lê o que ele diz', async () => {
    const reading = await readVehicleDocument({
      data: buildCrlvPdf(),
      getDocument: getLegacyDocument,
    })

    expect(reading.kind).toBe('crlv')
    expect(reading.values.plate).toBe('GCQ8E47')
    expect(reading.values.ownerName).toBe('MARIA DE SOUSA')
    expect(reading.values.municipality).toBe('SAO PAULO')
  })

  test('o CCMEI lido pelo leitor de veículo não preenche campo nenhum', async () => {
    const reading = await readVehicleDocument({
      data: buildCcmeiPdf(),
      getDocument: getLegacyDocument,
    })

    expect(reading.kind).toBe('ccmei')
    expect(reading.values).toEqual({})
  })
})
