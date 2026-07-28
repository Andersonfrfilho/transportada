/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { NfeXmlImportError, type ImportedNfeXml } from '@adatechnology/fiscal-provider'

import { createNfeXmlImporter } from '../src/nfe-imports/infrastructure/nfe-xml-importer.gateway.js'

const ACCESS_KEY = '35190730290856000160550010000000011000000010'

function authorizedDocument(xml: string): ImportedNfeXml {
  return {
    chaveNfe: ACCESS_KEY,
    document: {
      accessKey: ACCESS_KEY,
      issuedAt: '2026-07-22T22:00:00.000Z',
      issuer: { name: 'Emitente', taxId: '30290856000160' },
      model: '55',
      number: '1',
      operationNature: 'Prestacao',
      operationType: '0',
      products: [],
      protocol: {
        authorizedAt: '2026-07-22T22:00:00.000Z',
        number: '135260000000001',
        reason: 'Autorizado',
        statusCode: '100',
      },
      relatedCnpjs: ['12345678000190'],
      series: '1',
      status: 'authorized',
      totals: { invoice: '10.0000', products: '10.0000' },
      volumes: [],
    },
    emitenteCnpj: '30290856000160',
    kind: 'authorized-nfe',
    mod: '55',
    nsu: '',
    schema: 'xml-import',
    situacao: '1',
    valorTotal: 10,
    xmlComprimido: '',
    xmlDecoded: xml,
  }
}

describe('nfe xml importer adapter contract', () => {
  test('delegates the raw XML to the underlying import function and resolves the parsed document', async () => {
    const seen: string[] = []
    const importer = createNfeXmlImporter({
      importXml(xml) {
        seen.push(xml)
        return authorizedDocument(xml)
      },
    })

    const result = await importer.importXml({ xml: '<NFe id="raw"/>' })

    expect(seen).toEqual(['<NFe id="raw"/>'])
    expect(result.kind).toBe('authorized-nfe')
  })

  test('propagates the package NfeXmlImportError unchanged', async () => {
    const importer = createNfeXmlImporter({
      importXml() {
        throw new NfeXmlImportError({
          code: 'NFE_XML_INVALID_STRUCTURE',
          message: 'invalid structure',
        })
      },
    })

    const rejection = importer.importXml({ xml: '<broken/>' })
    await expect(rejection).rejects.toBeInstanceOf(NfeXmlImportError)
    await expect(rejection).rejects.toMatchObject({ code: 'NFE_XML_INVALID_STRUCTURE' })
  })

  test('wires the real fiscal-provider importer by default and rejects junk XML as NfeXmlImportError', async () => {
    const importer = createNfeXmlImporter()

    await expect(importer.importXml({ xml: '<not-a-nfe/>' })).rejects.toBeInstanceOf(
      NfeXmlImportError,
    )
  })
})
