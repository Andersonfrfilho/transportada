/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ **Medido em staging em 23/09 às 00:38**: registrar ocorrência com três itens marcados respondia
 * `422`, e a tela dizia "Sem conexão com o servidor". Não era rede: o cliente mandava os **dois**
 * contratos no mesmo corpo — `productCode` (o antigo, de item único) e `productCodes` (a lista) —, e
 * a API recusa a combinação de propósito (`OccurrenceProductSelectionConflictError`), porque com os
 * dois preenchidos ninguém sabe qual vale.
 *
 * A linha do legado nasceu para o bundle sobreviver a uma API que ainda não tinha a lista. Essa API
 * não existe mais em lugar nenhum, e o que sobrou foi o conflito.
 */
import { describe, expect, it } from 'bun:test'

import { createTripClient } from '@/modules/trip/shared/tripClient.service'

const TRIP_ID = '66667bb0-1618-417a-96da-f3148da475a3'
const DOCUMENT_ID = '57f1f892-be13-4f82-b64c-44edf36ac52c'

async function captureRegisterBody(
  productCodes: readonly string[],
): Promise<Readonly<{ productCode: readonly string[]; productCodes: readonly string[] }>> {
  let captured: FormData | undefined
  const client = createTripClient({
    apiUrl: 'https://api.exemplo.com.br',
    getAccessToken: () => Promise.resolve('token-sintetico'),
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(String(input), init)
      captured = await request.formData()
      return new Response(
        JSON.stringify({
          data: {
            attachments: [],
            createdAt: '2026-09-23T00:38:22.560Z',
            email: null,
            id: 'ocorrencia-1',
            note: '',
            occurrenceTypeId: '54ed0225-f293-47c3-84fe-0b66eff68784',
            productCode: productCodes[0] ?? '',
            productCodes,
            stage: 'separation',
            typeName: 'Item avariado',
          },
        }),
        { headers: { 'content-type': 'application/json' }, status: 201 },
      )
    },
  })

  await client.registerTripOccurrence({
    documentId: DOCUMENT_ID,
    file: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
    idempotencyKey: 'chave-1',
    note: '',
    occurrenceTypeId: '54ed0225-f293-47c3-84fe-0b66eff68784',
    productCodes,
    productQuantities: productCodes.map(() => null),
    productQuantityUnits: productCodes.map(() => null),
    tripId: TRIP_ID,
  })

  return {
    productCode: (captured?.getAll('productCode') ?? []).map(String),
    productCodes: (captured?.getAll('productCodes') ?? []).map(String),
  }
}

describe('corpo do registro de ocorrência (defeito medido em 23/09)', () => {
  it('manda só a lista quando há item marcado, nunca os dois contratos juntos', async () => {
    const corpo = await captureRegisterBody(['183', '184', '7213'])

    expect(corpo.productCodes).toEqual(['183', '184', '7213'])
    expect(corpo.productCode).toEqual([])
  })

  /** Um item só continua indo pela lista — não há dois caminhos para a mesma coisa. */
  it('um item marcado também vai pela lista', async () => {
    const corpo = await captureRegisterBody(['183'])

    expect(corpo.productCodes).toEqual(['183'])
    expect(corpo.productCode).toEqual([])
  })

  /** A nota inteira não manda item nenhum: lista vazia é o estado, não um código sentinela. */
  it('a nota inteira não manda item', async () => {
    const corpo = await captureRegisterBody([])

    expect(corpo.productCodes).toEqual([])
    expect(corpo.productCode).toEqual([])
  })
})
