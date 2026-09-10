/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveBedDimensions,
  resolveCargoLayout,
} from '../../src/trips/domain/cargo-layout.policy.js'

/** Baú de truck medido com fita: 8,900 × 2,500 × 2,400 = 53,400 m³. */
const BAU = { heightM: '2.400', lengthM: '8.900', source: 'measured' as const, widthM: '2.500' }
/** Uma faixa de 1 m de profundidade neste baú são 2,5 × 2,4 = 6,000 m³. */
const CAPACIDADE = { bedDimensions: BAU, capacityM3: '53.400000' }

/** Três paradas na ordem de entrega: a primeira é a que sai primeiro, e fica na porta. */
const PARADAS = [
  { documentsWithoutVolume: 0, label: 'Barrinha', sequence: 1, volumeM3: '6.000000' },
  { documentsWithoutVolume: 0, label: 'Descalvado', sequence: 2, volumeM3: '12.000000' },
  { documentsWithoutVolume: 0, label: 'Campinas', sequence: 3, volumeM3: '18.000000' },
]

function slicesOf(input: Parameters<typeof resolveCargoLayout>[0]) {
  const layout = resolveCargoLayout(input)

  return (layout?.slices ?? []).map((slice) => ({
    depthM: slice.depthM,
    distanceFromDoorM: slice.distanceFromDoorM,
    label: slice.label,
    loadOrder: slice.loadOrder,
  }))
}

/**
 * Spec 088 G002: a fileira da 085 é proporção, e proporção não tem metro. Aqui ela ganha o metro
 * que a fita do conferente confere — e só quando a ficha do veículo tem as três medidas.
 */
describe('profundidade da faixa no baú (spec 088)', () => {
  /**
   * A profundidade não passa pela capacidade: é `volume ÷ (largura × altura)`, a fatia transversal
   * de verdade. Com o baú medido as duas contas coincidem, mas a capacidade pode ser um m³ que
   * alguém digitou — e aí a faixa herdaria um denominador que não é este baú.
   */
  test('a profundidade é o volume dividido pela seção do baú', () => {
    expect(slicesOf({ ...CAPACIDADE, stops: PARADAS }).map((slice) => slice.depthM)).toEqual([
      '1.000',
      '2.000',
      '3.000',
    ])
  })

  /**
   * ⚠️ Critério 4: do fundo para a porta, a ordem é a inversa da entrega. Campinas entrega por
   * último, então encosta na parede do fundo; Barrinha entrega primeiro e fica na porta.
   */
  test('a distância da porta cresce do fundo para a porta, na ordem inversa da entrega', () => {
    const slices = slicesOf({ ...CAPACIDADE, stops: PARADAS })

    /** Carga de 6 m nos 8,9 m do baú: sobram 2,900 m livres, e eles ficam junto da porta. */
    expect(slices).toEqual([
      { depthM: '1.000', distanceFromDoorM: '2.900', label: 'Barrinha', loadOrder: 3 },
      { depthM: '2.000', distanceFromDoorM: '3.900', label: 'Descalvado', loadOrder: 2 },
      { depthM: '3.000', distanceFromDoorM: '5.900', label: 'Campinas', loadOrder: 1 },
    ])
  })

  /** Critério 3: a soma das profundidades é o comprimento do baú menos o espaço livre. */
  test('as profundidades somadas com o espaço livre dão o comprimento do baú', () => {
    const layout = resolveCargoLayout({ ...CAPACIDADE, stops: PARADAS })

    expect(layout?.bedLengthM).toBe('8.900')
    expect(layout?.bedWidthM).toBe('2.500')
    expect(layout?.freeDepthM).toBe('2.900')
    expect(layout?.overflowDepthM).toBe('0.000')
  })

  /**
   * ⚠️ Critério 6: o que não cabe sai **fora** da porta, e a distância dele é negativa de
   * propósito. Encolher tudo para caber esconderia o estouro, que é a informação.
   */
  test('a carga que não cabe atravessa a porta e o metro excedente é dito', () => {
    const layout = resolveCargoLayout({
      ...CAPACIDADE,
      stops: [
        { documentsWithoutVolume: 0, label: 'Barrinha', sequence: 1, volumeM3: '12.000000' },
        { documentsWithoutVolume: 0, label: 'Campinas', sequence: 2, volumeM3: '48.000000' },
      ],
    })

    expect(layout?.overflowDepthM).toBe('1.100')
    expect(layout?.freeDepthM).toBe('0.000')
    expect(layout?.slices.map((slice) => slice.distanceFromDoorM)).toEqual(['-1.100', '0.900'])
  })

  /**
   * ⚠️ A ausência é o caso normal: 8 de 8 veículos estão sem medida. Ela não pode derrubar as
   * fileiras proporcionais da 085 — elas continuam inteiras, e só o metro some.
   */
  test('sem a medida do baú a faixa não promete metro, e a fileira da 085 continua', () => {
    const layout = resolveCargoLayout({
      bedDimensions: null,
      capacityM3: '53.400000',
      stops: PARADAS,
    })

    expect(layout?.bedLengthM).toBeNull()
    expect(layout?.bedWidthM).toBeNull()
    expect(layout?.freeDepthM).toBeNull()
    expect(layout?.overflowDepthM).toBeNull()
    expect(layout?.slices.map((slice) => slice.depthM)).toEqual([null, null, null])
    expect(layout?.slices.map((slice) => slice.distanceFromDoorM)).toEqual([null, null, null])
    expect(layout?.rows.length).toBeGreaterThan(0)
    expect(layout?.slices.map((slice) => slice.share)).toEqual(['0.1124', '0.2247', '0.3371'])
  })

  /** Uma parada só ocupa a profundidade da carga dela, nunca o baú inteiro. */
  test('uma parada só não vira o baú inteiro', () => {
    const layout = resolveCargoLayout({
      ...CAPACIDADE,
      stops: [{ documentsWithoutVolume: 0, label: 'Única', sequence: 1, volumeM3: '6.000000' }],
    })

    expect(layout?.slices[0]?.depthM).toBe('1.000')
    expect(layout?.slices[0]?.distanceFromDoorM).toBe('7.900')
  })

  /**
   * ⚠️ D2: a escala sai da FICHA, e a referência de mercado não desenha planta nenhuma. Ela erra
   * por 2× dentro do mesmo tipo — um VUC existe de 13 e de 26 m³ —, e aqui o erro deixaria de ser
   * uma porcentagem e viraria metro na tela de quem vai medir com fita.
   */
  /**
   * ⚠️ Visto na tela, não no teste: a planta sumia de uma viagem cujo veículo TEM as três medidas,
   * porque a medida era derivada de `occupancy` — e a ocupação é nula quando **nenhuma nota tem
   * cubagem**. Pior que sumir: o aviso mandava preencher um campo que já estava preenchido.
   *
   * A escala é da FICHA. Volume é outra pergunta, e a resposta dela não pode apagar a primeira.
   */
  test('a planta existe sem cubagem nenhuma, porque a escala não vem do volume', () => {
    const layout = resolveCargoLayout({
      bedDimensions: BAU,
      capacityM3: null,
      stops: [
        { documentsWithoutVolume: 3, label: 'Franca', sequence: 1, volumeM3: null },
        { documentsWithoutVolume: 2, label: 'Batatais', sequence: 2, volumeM3: null },
      ],
    })

    expect(layout?.bedLengthM).toBe('8.900')
    expect(layout?.bedWidthM).toBe('2.500')
    /** Sem volume não há faixa — mas o baú continua medido, e a tela não acusa a ficha. */
    expect(layout?.slices).toEqual([])
    expect(layout?.stopsWithoutVolume).toHaveLength(2)
  })

  /**
   * ⚠️ **A 088 D2 recusava o catálogo como escala, e a decisão mudou** — por pedido de quem opera,
   * depois de a frota real mostrar o custo: o veículo sem baú medido ficava sem planta nenhuma, e
   * quem carrega perdia o desenho inteiro por três campos que ninguém preencheu.
   *
   * O argumento da 088 não foi apagado: a dispersão dentro de um tipo chega a 2×. O que mudou é o
   * remédio — em vez de esconder, o desenho sai com a **origem colada nele**, e a tela é obrigada a
   * dizer que a escala é de catálogo. Este contrato guarda a marca, que é o que torna a mudança
   * honesta; sem ela, o palpite volta a se apresentar como fita.
   */
  test('o catálogo alimenta a planta, e a origem vai junto', () => {
    const daFicha = { capacityDimensions: BAU, capacitySource: 'measured' } as const
    const daReferencia = {
      capacityDimensions: { ...BAU, source: 'reference' as const },
      capacitySource: 'reference',
    } as const
    const digitado = { capacityDimensions: null, capacitySource: 'declared' } as const

    expect(resolveBedDimensions(daFicha)?.source).toBe('measured')
    expect(resolveBedDimensions(daReferencia)?.source).toBe('reference')
    /** Digitado é m³ sem medida: não há três dimensões, e desenho nenhum sai daí. */
    expect(resolveBedDimensions(digitado)).toBeNull()
    expect(resolveBedDimensions(null)).toBeNull()
  })
})

/** As três medidas do Fiorino da spec 100, e um baú de truck onde a faixa não cabe. */
const FIORINO = { heightM: '1.300', lengthM: '1.700', source: 'measured' as const, widthM: '1.450' }
const TRUCK = { heightM: '2.300', lengthM: '7.400', source: 'measured' as const, widthM: '2.470' }

function caixa(overrides: Record<string, unknown>) {
  return {
    count: 1,
    grossWeightGrams: null,
    heightMm: 300,
    isFragile: null,
    isStackable: null,
    keepUpright: null,
    label: 'CAIXA',
    lengthMm: 400,
    maxStackCount: null,
    widthMm: 300,
    ...overrides,
  }
}

function paradasComCaixa(input: { readonly caixas: readonly ReturnType<typeof caixa>[] }) {
  return [1, 2, 3].map((sequence) => ({
    boxes: input.caixas,
    documentsWithoutVolume: 0,
    label: `Parada ${String(sequence)}`,
    sequence,
    volumeM3: '0.200000',
  }))
}

/**
 * **A tabela e a planta desenham a mesma viagem** (spec 100 D5, aceite 8).
 *
 * ⚠️ Este é o contrato que impede as duas políticas de divergirem. Elas são separadas —
 * `resolveCargoLayout` monta a tabela e `resolveCargoPlacement` monta o desenho — e nada nas duas
 * falha quando discordam: a tela mostra faixas e a tabela descreve profundidade, as duas
 * plausíveis, uma errada, e o operador segue uma delas.
 */
describe('o arranjo publicado (spec 100)', () => {
  test('três paradas que cabem lado a lado saem em faixas, e todas encostam na porta', () => {
    const layout = resolveCargoLayout({
      bedDimensions: FIORINO,
      capacityM3: '3.200000',
      stops: paradasComCaixa({ caixas: [caixa({})] }),
    })

    expect(layout?.stopArrangement).toBe('lanes')
    expect(layout?.slices.map((slice) => slice.distanceFromDoorM)).toEqual([
      '0.000',
      '0.000',
      '0.000',
    ])
  })

  /**
   * ⚠️ **A ordem deixa de obrigar em faixas, inclusive no baú que só abre atrás.** É o ponto inteiro
   * do arranjo: quem quiser a terceira entrega alcança a faixa dela sem mexer nas outras duas. Manter
   * `orderIsBinding` preso ao acesso faria a tela exigir uma ordem que o desenho não impõe.
   */
  test('em faixas a ordem não obriga, mesmo em baú que só abre atrás', () => {
    const layout = resolveCargoLayout({
      bedDimensions: FIORINO,
      capacityM3: '3.200000',
      loadingAccess: 'rear',
      stops: paradasComCaixa({ caixas: [caixa({})] }),
    })

    expect(layout?.orderIsBinding).toBe(false)
    expect(layout?.rows.every((row) => row.sideReachable)).toBe(true)
  })

  /** Caixa que não cabe na faixa devolve a viagem à profundidade, e a distância volta a existir. */
  test('caixa larga demais devolve a viagem à profundidade', () => {
    const layout = resolveCargoLayout({
      bedDimensions: TRUCK,
      capacityM3: '42.000000',
      loadingAccess: 'rear',
      stops: paradasComCaixa({
        caixas: [caixa({}), caixa({ heightMm: 50, lengthMm: 1_300, widthMm: 1_300 })],
      }),
    })

    expect(layout?.stopArrangement).toBe('depth')
    expect(layout?.orderIsBinding).toBe(true)
    expect(new Set(layout?.slices.map((slice) => slice.distanceFromDoorM)).size).toBe(3)
  })

  /** A física vence: acima de metade do teto de massa a tabela volta a descrever profundidade. */
  test('carga pesada devolve a tabela à profundidade', () => {
    const layout = resolveCargoLayout({
      bedDimensions: FIORINO,
      capacityM3: '3.200000',
      payloadRatio: '0.8000',
      stops: paradasComCaixa({ caixas: [caixa({})] }),
    })

    expect(layout?.stopArrangement).toBe('depth')
  })

  /**
   * ⚠️ **O aceite 8**: a tabela e o desenho saem da mesma decisão. Se um dia alguém resolver o
   * arranjo duas vezes, é aqui que aparece — e não na tela do operador.
   */
  test('a planta e a tabela concordam sobre o arranjo, em toda combinação', () => {
    const casos = [
      { bedDimensions: FIORINO, capacityM3: '3.200000', payloadRatio: null },
      { bedDimensions: FIORINO, capacityM3: '3.200000', payloadRatio: '0.9000' },
      { bedDimensions: TRUCK, capacityM3: '42.000000', payloadRatio: null },
    ] as const

    for (const caso of casos) {
      const layout = resolveCargoLayout({
        ...caso,
        stops: paradasComCaixa({ caixas: [caixa({})] }),
      })
      const desenho = layout?.placement?.layers.flatMap((layer) => layer.boxes) ?? []
      /** Em faixas as paradas se separam no `y`; em profundidade, no `x`. */
      const separaNoY = new Set(desenho.map((box) => box.yM)).size > 1
      const separaNoX = new Set(desenho.map((box) => box.xM)).size > 1

      expect(layout?.stopArrangement === 'lanes' ? separaNoY : separaNoX).toBe(true)
    }
  })
})
