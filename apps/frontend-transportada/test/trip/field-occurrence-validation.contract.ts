import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()

const BASE_OCCURRENCE = {
  createdAt: '2026-09-18T12:00:00.000Z',
  id: 'occurrence-1',
  note: 'cliente ausente',
  occurrenceTypeId: 'type-1',
  productCode: '',
  stage: 'delivery' as const,
  typeName: 'Cliente ausente',
}

/**
 * Spec 156 T9 (D3, M1): `channel`/`actorName`/`onBehalfOfDriverName` nascem opcionais — API na
 * frente do bundle não pode apagar a ocorrência inteira; bundle novo com API antiga aceita a
 * ausência (aceita, corretamente, um contrato mais antigo).
 */
describe('leitura da ocorrência com autoria (spec 156 T9)', () => {
  it('aceita a ocorrência sem os três campos novos, como uma API anterior a esta task serviria', () => {
    expect(() => adapters.occurrencesFromApi([BASE_OCCURRENCE])).not.toThrow()
  })

  it('aceita a ocorrência do escritório, com o ator sem vínculo ativo (null, nunca id cru)', () => {
    const items = adapters.occurrencesFromApi([
      {
        ...BASE_OCCURRENCE,
        actorName: null,
        channel: 'office',
        onBehalfOfDriverName: 'João Pereira',
      },
    ])
    expect(items[0]?.channel).toBe('office')
    expect(items[0]?.actorName).toBeNull()
    expect(items[0]?.onBehalfOfDriverName).toBe('João Pereira')
  })

  it('recusa canal fora do vocabulário (driver_app | office | whatsapp | backoffice, spec 158 D2)', () => {
    expect(() =>
      adapters.occurrencesFromApi([{ ...BASE_OCCURRENCE, channel: 'invented' }]),
    ).toThrow()
  })

  it('recusa chave desconhecida — continua exata fora da lista opcional', () => {
    expect(() =>
      adapters.occurrencesFromApi([{ ...BASE_OCCURRENCE, somethingElse: 'x' }]),
    ).toThrow()
  })
})

describe('catálogo de ocorrência de rua e resultado do lote (spec 156 T9)', () => {
  it('fieldOccurrenceTypesFromApi aceita a lista { id, name }', () => {
    const types = adapters.fieldOccurrenceTypesFromApi([{ id: 'type-1', name: 'Cliente ausente' }])
    expect(types).toHaveLength(1)
  })

  it('fieldOccurrenceTypesFromApi recusa item com chave a mais', () => {
    expect(() =>
      adapters.fieldOccurrenceTypesFromApi([{ id: 'type-1', name: 'x', active: true }]),
    ).toThrow()
  })

  it('fieldOccurrenceBatchResultFromApi devolve os itens na ordem do pedido', () => {
    const items = adapters.fieldOccurrenceBatchResultFromApi({
      items: [
        { documentId: 'doc-1', id: 'occ-1' },
        { documentId: 'doc-2', id: 'occ-2' },
      ],
    })
    expect(items.map((item) => item.documentId)).toEqual(['doc-1', 'doc-2'])
  })

  it('fieldOccurrenceBatchResultFromApi recusa corpo sem items', () => {
    expect(() => adapters.fieldOccurrenceBatchResultFromApi({})).toThrow()
  })
})
