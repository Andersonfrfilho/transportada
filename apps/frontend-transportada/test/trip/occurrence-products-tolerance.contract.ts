/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 166 T101 (RF6/CA07): a resposta da ocorrência vai ganhar `products` — item com quantidade e
 * unidade. Este contrato existe para o bundle **de hoje** aceitar essa resposta antes de a API
 * mandá-la.
 *
 * ⚠️ Não é zelo abstrato. Em 22/09 às 19:03, em staging, a API respondeu 201, gravou a ocorrência e
 * a foto, e a tela disse `TRIP_RESPONSE_INVALID`: o guard tem lista **fechada** de chaves, e uma
 * chave que ele não conhece derruba a resposta inteira. O id da ocorrência morre junto, e a segunda
 * foto nunca é enviada porque não sabe mais a que ocorrência se anexar. Campo novo na API sem esta
 * tolerância publicada antes não degrada: quebra.
 */
import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()

function buildRegistered(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    attachments: [{ id: 'a1', position: 1 }],
    createdAt: '2026-09-22T19:03:10.795Z',
    email: null,
    id: '4b581a02-3dba-4df9-a20b-20ac66163fa1',
    note: '',
    occurrenceTypeId: '54ed0225-f293-47c3-84fe-0b66eff68784',
    productCode: '183',
    productCodes: ['183'],
    stage: 'separation',
    typeName: 'Item avariado',
    ...extra,
  }
}

describe('tolerância a `products` na ocorrência registrada (spec 166 CA07)', () => {
  it('aceita a resposta de hoje, sem `products`', () => {
    const registered = adapters.registeredOccurrenceFromApi(buildRegistered())

    expect(registered.id).toBe('4b581a02-3dba-4df9-a20b-20ac66163fa1')
    expect(registered.productCodes).toEqual(['183'])
  })

  it('aceita a resposta com `products`, e devolve a quantidade por item', () => {
    const registered = adapters.registeredOccurrenceFromApi(
      buildRegistered({
        products: [
          { code: '183', quantity: '3.000', unit: 'unit' },
          { code: '184', quantity: null, unit: null },
        ],
      }),
    )

    expect(registered.products).toEqual([
      { code: '183', quantity: '3.000', unit: 'unit' },
      { code: '184', quantity: null, unit: null },
    ])
  })

  /** `productCodes` continua sendo a fonte dos bundles antigos — `products` não o substitui. */
  it('não deixa de publicar `productCodes` quando `products` vem junto', () => {
    const registered = adapters.registeredOccurrenceFromApi(
      buildRegistered({ products: [{ code: '183', quantity: '1.000', unit: 'box' }] }),
    )

    expect(registered.productCodes).toEqual(['183'])
  })

  /**
   * Tolerar chave nova não é aceitar lixo: uma unidade que o bundle não conhece cairia na tela como
   * texto cru. O item inteiro é recusado, e a resposta segue sem ele.
   */
  it('recusa a resposta quando `products` não tem a forma combinada', () => {
    expect(() =>
      adapters.registeredOccurrenceFromApi(
        buildRegistered({ products: [{ code: '183', quantity: '1.000', unit: 'caixas' }] }),
      ),
    ).toThrow()
    expect(() =>
      adapters.registeredOccurrenceFromApi(buildRegistered({ products: 'nenhum' })),
    ).toThrow()
  })
})
