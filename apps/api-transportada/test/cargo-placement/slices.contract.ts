/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveCargoPlacement,
  type CargoPlacement,
  type PlacedBox,
  type PlacementBox,
} from '../../src/trips/domain/cargo-placement.policy.js'

/** Baú de truck medido: 7,40 × 2,47 × 2,30 m — o mesmo da frota de teste. */
const BED = { heightM: '2.300', lengthM: '7.400', widthM: '2.470' } as const

function box(overrides: Partial<PlacementBox>): PlacementBox {
  return {
    count: 1,
    heightMm: 400,
    isFragile: null,
    isStackable: null,
    keepUpright: null,
    label: 'CAIXA',
    lengthMm: 600,
    maxStackCount: null,
    source: 'measured',
    stopSequence: 1,
    widthMm: 400,
    ...overrides,
  }
}

function placed(plan: CargoPlacement | null): readonly PlacedBox[] {
  return plan?.layers.flatMap((layer) => layer.boxes) ?? []
}

/** A faixa que a parada ocupa ao longo do comprimento do baú. */
function extent(boxes: readonly PlacedBox[], stopSequence: number): { from: number; to: number } {
  const own = boxes.filter((entry) => entry.stopSequence === stopSequence)
  return {
    from: Math.min(...own.map((entry) => entry.xM)),
    to: Math.max(...own.map((entry) => entry.xM + entry.depthM)),
  }
}

/**
 * **A fatia por parada é proibição, não preferência** (spec 095 G001).
 *
 * Antes desta spec a varredura ordenava por parada e enchia o baú em fileiras: a última parada
 * *tendia* a ficar no fundo, e bastava a fileira virar para a carga de duas paradas dividir a mesma
 * camada. Quem abria a porta na primeira entrega tinha de tirar caixa de outra parada de cima.
 *
 * A fatia acaba com a tendência: cada parada tem um trecho do comprimento do baú, e nada atravessa.
 */
describe('a fatia por parada (spec 095 G001)', () => {
  /**
   * ⚠️ **Contígua e sem sobreposição.** Não basta a última parada começar mais fundo: o fim da fatia
   * dela tem de vir antes do começo da fatia seguinte, senão as duas se encontram no meio do baú.
   */
  test('cada parada ocupa uma faixa própria, da mais funda para a porta', () => {
    const plan = resolveCargoPlacement({
      bed: BED,
      boxes: [
        box({ count: 12, label: 'P1', stopSequence: 1 }),
        box({ count: 12, label: 'P2', stopSequence: 2 }),
        box({ count: 12, label: 'P3', stopSequence: 3 }),
      ],
    })
    const boxes = placed(plan)

    const third = extent(boxes, 3)
    const second = extent(boxes, 2)
    const first = extent(boxes, 1)

    expect(third.from).toBe(0)
    expect(third.to).toBeLessThanOrEqual(second.from + 1e-9)
    expect(second.to).toBeLessThanOrEqual(first.from + 1e-9)
  })

  /**
   * ⚠️ É a **proibição** que resolve a descarga, e ela vale em três dimensões: duas caixas de paradas
   * diferentes não podem dividir a mesma coluna do piso, em nenhuma camada. Sem isto, empilhar
   * dentro da fatia voltaria a pôr a parada 1 debaixo da parada 3.
   */
  test('nenhuma caixa fica em cima nem atrás da carga de outra parada', () => {
    const plan = resolveCargoPlacement({
      bed: BED,
      boxes: [
        box({ count: 60, label: 'P1', stopSequence: 1 }),
        box({ count: 60, label: 'P2', stopSequence: 2 }),
      ],
    })
    const boxes = placed(plan)

    const overlapping = boxes.filter((entry) =>
      boxes.some(
        (other) =>
          other.stopSequence !== entry.stopSequence &&
          entry.xM < other.xM + other.depthM - 1e-9 &&
          other.xM < entry.xM + entry.depthM - 1e-9,
      ),
    )

    expect(overlapping).toEqual([])
  })

  /**
   * ⚠️ **A fatia é dimensionada por volume, não por contagem.** Dez caixas pequenas ocupam menos baú
   * que duas grandes; repartir o comprimento em partes iguais estouraria uma fatia e deixaria a
   * outra vazia — e o estouro sairia como carga que não cabe num baú que tem espaço sobrando.
   */
  test('mede a fatia pelo volume da parada, não pelo número de caixas', () => {
    const plan = resolveCargoPlacement({
      bed: BED,
      boxes: [
        /** Muitas caixas pequenas: 20 × 0,008 m³ = 0,16 m³. */
        box({
          count: 20,
          heightMm: 200,
          label: 'MIUDO',
          lengthMm: 200,
          stopSequence: 1,
          widthMm: 200,
        }),
        /** Poucas caixas grandes: 2 × 0,72 m³ = 1,44 m³. */
        box({
          count: 2,
          heightMm: 800,
          label: 'GRANDE',
          lengthMm: 1200,
          stopSequence: 2,
          widthMm: 750,
        }),
      ],
    })
    const boxes = placed(plan)

    const small = extent(boxes, 1)
    const big = extent(boxes, 2)

    expect(big.to - big.from).toBeGreaterThan(small.to - small.from)
  })

  /** Uma parada só continua enchendo o baú inteiro: a fatia não é um teto, é uma divisão. */
  test('com uma parada só, a fatia é o baú', () => {
    const plan = resolveCargoPlacement({ bed: BED, boxes: [box({ count: 40 })] })

    expect(placed(plan).length).toBe(40)
  })
})

/**
 * **Medida embaixo, presumida em cima** (spec 095 G002).
 *
 * A pegada é o critério de base — caixa grande sob caixa pequena é a pilha que desaba, e é o único
 * critério de empilhamento que vale sem nenhum dado cadastrado (`is_stackable`, `max_stack_count`,
 * `is_fragile` e `keep_upright` estão vazios em 663 de 663 caixas desta base).
 *
 * ⚠️ A **medição precede a pegada**, e não o contrário. Toda caixa presumida herda a mesma caixa do
 * fallback: ordenar só por pegada as agrupava numa faixa contígua que caía no meio da fatia, porque
 * o tamanho do fallback fica no meio da escala — efeito colateral que ninguém decidiu. Com a
 * presumida por cima, o agrupamento vira decisão: o que precisa de fita fica à mão, sem desmontar
 * pilha, e a base fica com o que tem medida de verdade.
 */
describe('a ordem dentro da fatia (spec 095 G002)', () => {
  /**
   * ⚠️ A afirmação é **relativa**, não "o piso só tem medida": com carga pequena as duas cabem no
   * piso, e exigir o piso puro reprovaria o arranjo certo. O que não pode é medida por cima de
   * presumida — aí a fita teria de descer a pilha.
   */
  test('nenhuma caixa medida fica acima de uma presumida', () => {
    const plan = resolveCargoPlacement({
      bed: BED,
      boxes: [
        box({ count: 60, label: 'PRESUMIDA', source: 'estimated' }),
        box({ count: 60, label: 'MEDIDA', source: 'measured' }),
      ],
    })
    const boxes = placed(plan)
    const measured = boxes.filter((entry) => entry.source === 'measured')
    const presumed = boxes.filter((entry) => entry.source === 'estimated')

    expect(presumed.length).toBeGreaterThan(0)
    expect(Math.max(...measured.map((entry) => entry.layer))).toBeLessThanOrEqual(
      Math.min(...presumed.map((entry) => entry.layer)),
    )
  })

  /** A base é a caixa larga: nenhuma camada carrega pegada maior que a de baixo. */
  test('nunca põe pegada maior sobre pegada menor', () => {
    const plan = resolveCargoPlacement({
      bed: BED,
      boxes: [
        box({ count: 30, label: 'PEQUENA', lengthMm: 300, widthMm: 300 }),
        box({ count: 30, label: 'GRANDE', lengthMm: 800, widthMm: 600 }),
      ],
    })
    const layers = plan?.layers ?? []
    const footprint = (entry: PlacedBox): number => entry.depthM * entry.widthM

    for (let index = 1; index < layers.length; index += 1) {
      const below = layers[index - 1]?.boxes ?? []
      const above = layers[index]?.boxes ?? []
      expect(Math.max(...above.map(footprint))).toBeLessThanOrEqual(
        Math.min(...below.map(footprint)) + 1e-9,
      )
    }
    expect(layers.length).toBeGreaterThan(1)
  })

  /** A frágil continua acima da presumida: quem não pode receber peso é o topo de tudo. */
  test('a frágil fica acima até da presumida', () => {
    const plan = resolveCargoPlacement({
      bed: BED,
      boxes: [
        box({ count: 40, label: 'PRESUMIDA', source: 'estimated' }),
        box({ count: 1, isFragile: true, label: 'OVOS' }),
      ],
    })
    const boxes = placed(plan)
    const fragile = boxes.find((entry) => entry.label === 'OVOS')
    const presumed = boxes.filter((entry) => entry.label === 'PRESUMIDA')

    expect(fragile?.layer).toBeGreaterThanOrEqual(Math.max(...presumed.map((entry) => entry.layer)))
  })
})

/**
 * **A carga dividida vai para o topo do lado de dentro** (spec 095 G003).
 *
 * Encher o baú às vezes exige quebrar a fatia de uma parada, e isso é legítimo. O que não é legítimo
 * é a sobra ir para qualquer canto: ela sobe para a camada de cima da região das paradas entregues
 * **depois** — mais fundo no baú. Ali ela é fácil de retirar (nada por cima), fácil de alcançar (as
 * fatias entre ela e a porta já saíram quando a vez dela chega) e fácil de ver (sai marcada).
 *
 * ⚠️ O sentido contrário — sobra para o lado da porta — é o que **não** pode: seria carga de parada
 * posterior em cima de quem entrega antes, exatamente o problema que a fatia veio resolver.
 */
describe('a carga dividida (spec 095 G003)', () => {
  /**
   * Fatia estreita para a parada 1: duas peças de 3 m num trecho de pouco mais de 1 m. Elas cabem no
   * baú e não na própria fatia — que é a definição de carga a dividir.
   */
  const overflowing = {
    bed: BED,
    boxes: [
      box({
        count: 2,
        heightMm: 400,
        label: 'COMPRIDA',
        lengthMm: 3000,
        stopSequence: 1,
        widthMm: 500,
      }),
      box({
        count: 60,
        heightMm: 400,
        label: 'FUNDO',
        lengthMm: 600,
        stopSequence: 2,
        widthMm: 400,
      }),
    ],
  } as const

  test('marca a sobra e a coloca mais funda que a própria fatia', () => {
    const boxes = placed(resolveCargoPlacement(overflowing))
    const split = boxes.filter((entry) => entry.reasons.includes('splitCargo'))
    const own = boxes.filter(
      (entry) => entry.stopSequence === 1 && !entry.reasons.includes('splitCargo'),
    )

    expect(split.length).toBeGreaterThan(0)
    expect(Math.max(...split.map((entry) => entry.xM))).toBeLessThan(
      Math.min(...own.map((entry) => entry.xM)),
    )
  })

  /** Nada por cima dela: a sobra é a última coisa a entrar naquela coluna. */
  test('não deixa nenhuma caixa em cima da sobra', () => {
    const boxes = placed(resolveCargoPlacement(overflowing))
    const split = boxes.filter((entry) => entry.reasons.includes('splitCargo'))

    const covered = split.filter((entry) =>
      boxes.some(
        (other) =>
          other !== entry &&
          other.layer > entry.layer &&
          entry.xM < other.xM + other.depthM - 1e-9 &&
          other.xM < entry.xM + entry.depthM - 1e-9 &&
          entry.yM < other.yM + other.widthM - 1e-9 &&
          other.yM < entry.yM + entry.widthM - 1e-9,
      ),
    )

    expect(covered).toEqual([])
  })

  /** A sobra da última parada não tem para onde ir: nada é mais fundo que ela. */
  test('não empurra a sobra para o lado da porta', () => {
    const boxes = placed(
      resolveCargoPlacement({
        bed: BED,
        boxes: [
          box({ count: 40, label: 'PORTA', lengthMm: 400, stopSequence: 1, widthMm: 400 }),
          box({ count: 200, label: 'FUNDO', lengthMm: 400, stopSequence: 2, widthMm: 400 }),
        ],
      }),
    )
    const split = boxes.filter((entry) => entry.reasons.includes('splitCargo'))

    expect(split.every((entry) => entry.stopSequence !== 2)).toBe(true)
  })
})

/**
 * Os defeitos que a revisão da 095 encontrou, e que nenhum contrato pegava.
 */
describe('os limites do baú na carga dividida (spec 095)', () => {
  /**
   * ⚠️ O mapa de alturas guardava a **altura própria** da caixa em vez do topo absoluto da coluna: o
   * apoio saía subestimado e a sobra passava pelo portão do teto. Medido antes da correção: caixas
   * divididas em 2,80 e 3,50 m dentro de um baú de 2,30.
   */
  test('nunca põe carga dividida acima do teto do baú', () => {
    const plan = resolveCargoPlacement({
      bed: { heightM: '2.300', lengthM: '4.000', widthM: '2.400' },
      boxes: [
        box({
          count: 30,
          heightMm: 700,
          label: 'FUNDO',
          lengthMm: 1100,
          stopSequence: 2,
          widthMm: 1100,
        }),
        box({
          count: 6,
          heightMm: 700,
          label: 'PORTA',
          lengthMm: 1100,
          stopSequence: 1,
          widthMm: 1100,
        }),
      ],
    })

    for (const entry of placed(plan)) {
      expect(entry.zM + entry.heightM).toBeLessThanOrEqual(2.3 + 1e-9)
    }
  })

  /** A altura de cada caixa vem da política, não de somar camadas fora dela. */
  test('publica a altura do piso até a base de cada caixa', () => {
    const plan = resolveCargoPlacement({ bed: BED, boxes: [box({ count: 200 })] })
    const boxes = placed(plan)

    expect(boxes.filter((entry) => entry.layer === 0).every((entry) => entry.zM === 0)).toBe(true)
    expect(boxes.some((entry) => entry.zM > 0)).toBe(true)
  })

  /**
   * ⚠️ Zero é ausência, não medida — o mesmo vocabulário da ficha do veículo. Uma linha zerada dava
   * fatia de comprimento zero à parada inteira, e toda caixa dela caía na divisão.
   */
  test('trata medida zerada como caixa não medida', () => {
    const plan = resolveCargoPlacement({
      bed: BED,
      boxes: [box({ label: 'ZERADA', lengthMm: 0 }), box({ label: 'BOA', stopSequence: 2 })],
    })

    expect(plan?.unplaced).toEqual([{ count: 1, label: 'ZERADA', reason: 'notMeasured' }])
    expect(placed(plan)).toHaveLength(1)
  })

  /**
   * ⚠️ O teto da divisão conta **tentativas**, não colocações: contando só o que entrou, a sobra sem
   * lugar nunca saturava o limite e cada caixa pagava a varredura inteira do baú.
   */
  test('não varre o baú inteiro por caixa quando a sobra não tem lugar', () => {
    const startedAt = performance.now()
    const plan = resolveCargoPlacement({
      bed: BED,
      boxes: Array.from({ length: 12 }, (_, stop) =>
        box({
          count: 75,
          heightMm: 1100,
          label: `P${String(stop)}`,
          lengthMm: 1200,
          stopSequence: stop + 1,
          widthMm: 1200,
        }),
      ),
    })

    expect(plan).not.toBeNull()
    expect(performance.now() - startedAt).toBeLessThan(50)
  })
})
