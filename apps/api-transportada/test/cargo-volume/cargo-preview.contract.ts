/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { buildCargoPreviewStops } from '../../src/trips/domain/cargo-preview.policy.js'
import { previewTripCargo } from '../../src/trips/application/preview-trip-cargo.use-case.js'

const NOTAS = [
  {
    addressKey: 'barrinha|14710000|100',
    label: 'Barrinha',
    nfeDocumentId: 'a',
    volumeM3: '2.000000',
    weightKilograms: null,
  },
  {
    addressKey: 'campinas|13000000|20',
    label: 'Campinas',
    nfeDocumentId: 'b',
    volumeM3: '1.000000',
    weightKilograms: null,
  },
  {
    addressKey: 'barrinha|14710000|100',
    label: 'Barrinha',
    nfeDocumentId: 'c',
    volumeM3: '0.500000',
    weightKilograms: null,
  },
]

describe('paradas da prévia de carga (spec 085 G002)', () => {
  /**
   * ⚠️ A parada é o **endereço**, não a nota nem o CNPJ: a mesma rede em cinco lojas é cinco
   * paradas, e duas notas do mesmo portão são uma só. É a mesma chave que o vínculo cria — se
   * divergirem, a prévia desenha um baú e o aceite cria outro.
   */
  test('notas do mesmo endereço viram uma parada só, com o volume somado', () => {
    const stops = buildCargoPreviewStops({ documents: NOTAS, order: [] })

    expect(stops).toHaveLength(2)
    expect(stops.find((stop) => stop.label === 'Barrinha')?.volumeM3).toBe('2.500000')
  })

  /** A ordem é a que o operador montou no mapa; a prévia não inventa roteiro. */
  test('a ordem escolhida manda na sequência', () => {
    const stops = buildCargoPreviewStops({
      documents: NOTAS,
      order: ['campinas|13000000|20', 'barrinha|14710000|100'],
    })

    expect(stops.map((stop) => stop.label)).toEqual(['Campinas', 'Barrinha'])
    expect(stops.map((stop) => stop.sequence)).toEqual([1, 2])
  })

  /** Sem ordem escolhida, vale a ordem em que a nota entrou — nunca uma ordenação inventada. */
  test('sem ordem, a sequência é a de chegada', () => {
    const stops = buildCargoPreviewStops({ documents: NOTAS, order: [] })

    expect(stops.map((stop) => stop.label)).toEqual(['Barrinha', 'Campinas'])
  })

  /** Parada fora da lista de ordem não some: ela vai para o fim, e continua desenhada. */
  test('parada que a ordem não menciona vai para o fim', () => {
    const stops = buildCargoPreviewStops({
      documents: NOTAS,
      order: ['campinas|13000000|20'],
    })

    expect(stops.map((stop) => stop.label)).toEqual(['Campinas', 'Barrinha'])
  })

  /** Nota sem cubagem é contada, nunca somada como zero — zero diria que ela não ocupa espaço. */
  test('nota sem cubagem é contada à parte', () => {
    const stops = buildCargoPreviewStops({
      documents: [
        {
          addressKey: 'x|1|1',
          label: 'Mista',
          nfeDocumentId: 'a',
          volumeM3: '2.000000',
          weightKilograms: null,
        },
        {
          addressKey: 'x|1|1',
          label: 'Mista',
          nfeDocumentId: 'b',
          volumeM3: null,
          weightKilograms: null,
        },
      ],
      order: [],
    })

    expect(stops[0]?.volumeM3).toBe('2.000000')
    expect(stops[0]?.documentsWithoutVolume).toBe(1)
  })

  /** Parada em que **nenhuma** nota tem cubagem entra sem volume — o layout a diz à parte. */
  test('parada inteira sem cubagem sai com volume nulo', () => {
    const stops = buildCargoPreviewStops({
      documents: [
        {
          addressKey: 'y|2|2',
          label: 'Sem',
          nfeDocumentId: 'a',
          volumeM3: null,
          weightKilograms: null,
        },
      ],
      order: [],
    })

    expect(stops[0]?.volumeM3).toBeNull()
    expect(stops[0]?.documentsWithoutVolume).toBe(1)
  })

  /**
   * ⚠️ Nota cujo endereço não normaliza não tem chave — e some do desenho se ninguém a segurar.
   * Ela vira parada própria pelo rótulo, que é o que o balde "Sem parada" do detalhe já faz.
   */
  test('nota sem chave de endereço vira parada própria, não some', () => {
    const stops = buildCargoPreviewStops({
      documents: [
        {
          addressKey: null,
          label: 'Sem chave',
          nfeDocumentId: 'a',
          volumeM3: '1.000000',
          weightKilograms: null,
        },
        {
          addressKey: null,
          label: 'Outra sem chave',
          nfeDocumentId: 'b',
          volumeM3: '1.000000',
          weightKilograms: null,
        },
      ],
      order: [],
    })

    expect(stops).toHaveLength(2)
  })
})

/**
 * Spec 085 G006: o desenho é de **volume**, e volume não conta a história do peso — mil caixas de
 * papel higiênico e cem de bebida enchem o mesmo baú com pesos que não se parecem.
 */
describe('a prévia acusa peso concentrado numa parada', () => {
  const CONTEXT = {
    bedDimensions: null,
    boxesByDocument: new Map(),
    capacityM3: '10.000000',
    cargoWeight: null,
    loadingAccess: 'rear' as const,
    occupancy: null,
  }

  test('devolve a parada que domina o peso, pela chave da parada', async () => {
    const preview = await previewTripCargo({
      companyId: 'company',
      nfeDocumentIds: ['a', 'b'],
      repository: {
        readCargoPreviewContext: async () => ({
          ...CONTEXT,
          documents: [
            {
              addressKey: 'porta-1',
              label: 'A',
              nfeDocumentId: 'a',
              volumeM3: '1.000000',
              weightKilograms: '800',
            },
            {
              addressKey: 'porta-2',
              label: 'B',
              nfeDocumentId: 'b',
              volumeM3: '1.000000',
              weightKilograms: '200',
            },
          ],
        }),
      },
      stopOrder: [],
      vehicleId: 'vehicle',
    })

    /** ⚠️ O aviso carrega o **rótulo** da parada: a chave crua (`3534302|14620000|50`) não diz a
     * ninguém de qual endereço se trata, e é justamente o aviso que pede uma ação. */
    expect(preview.weightConcentration).toEqual({
      label: 'A',
      share: 0.8,
      stopId: 'porta-1',
    })
  })

  test('carga equilibrada não acusa nada', async () => {
    const preview = await previewTripCargo({
      companyId: 'company',
      nfeDocumentIds: ['a', 'b'],
      repository: {
        readCargoPreviewContext: async () => ({
          ...CONTEXT,
          documents: [
            {
              addressKey: 'porta-1',
              label: 'A',
              nfeDocumentId: 'a',
              volumeM3: '1.000000',
              weightKilograms: '500',
            },
            {
              addressKey: 'porta-2',
              label: 'B',
              nfeDocumentId: 'b',
              volumeM3: '1.000000',
              weightKilograms: '500',
            },
          ],
        }),
      },
      stopOrder: [],
      vehicleId: 'vehicle',
    })

    expect(preview.weightConcentration).toBeNull()
  })
})
