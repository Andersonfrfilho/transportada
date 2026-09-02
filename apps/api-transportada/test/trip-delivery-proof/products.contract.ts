/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { readTripDocumentProducts } from '../../src/trips/application/read-trip-document-products.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000011'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000017'

const PRODUTO = {
  code: 'ZG-4410',
  commercialUnit: 'CX',
  description: 'CAIXA DE PARAFUSOS 4410',
  ordinal: 1,
  quantity: '20.0000',
  totalValue: '1500.0000',
  unitValue: '75.0000',
}

function repository(products: readonly (typeof PRODUTO)[] = [PRODUTO]) {
  const calls: object[] = []
  return {
    calls,
    port: {
      async listDocumentProducts(input: object) {
        calls.push(input)
        return products
      },
    },
  }
}

describe('read trip document products contract', () => {
  test('a consulta é escopada pela empresa e pela viagem', async () => {
    const { calls, port } = repository()

    await readTripDocumentProducts({
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      repository: port,
      tripId: TRIP_ID,
    })

    expect(calls).toEqual([{ companyId: COMPANY_ID, documentId: DOCUMENT_ID, tripId: TRIP_ID }])
  })

  /**
   * ⚠️ **NCM e CFOP não saem daqui.** Eles são classificação fiscal, e quem confere a carga no
   * galpão precisa de código, descrição e quantidade — o resto é ruído numa lista que se lê com a
   * caixa na mão. Publicá-los "porque a tabela tem" é o caminho por onde uma tela de conferência
   * vira relatório fiscal sem ninguém decidir isso.
   */
  test('publica o que se confere com a caixa na mão, e nada de classificação fiscal', async () => {
    const products = await readTripDocumentProducts({
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      repository: repository().port,
      tripId: TRIP_ID,
    })

    expect(products).toEqual([PRODUTO])
    expect(JSON.stringify(products)).not.toInclude('ncm')
    expect(JSON.stringify(products)).not.toInclude('cfop')
  })

  /** Nota sem item é lista vazia: acontece com vínculo que é só cálculo de frete. */
  test('nota sem produto devolve lista vazia', async () => {
    expect(
      await readTripDocumentProducts({
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        repository: repository([]).port,
        tripId: TRIP_ID,
      }),
    ).toEqual([])
  })
})
