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
const BED = {
  heightM: '2.300',
  lengthM: '7.400',
  source: 'measured' as const,
  widthM: '2.470',
} as const

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

/**
 * A caixa que não cabe em faixa nenhuma, e é ela que mantém a viagem em **profundidade** (spec 100
 * D2): as faixas cabem quando a soma das larguras mínimas — a caixa mais larga de cada parada,
 * girada se for o caso — cabe na largura do baú. Com 2,20 m numa parada, qualquer vizinha estoura os
 * 2,47 m deste baú.
 *
 * ⚠️ Ela é **baixa** de propósito — 5 cm. O que bloqueia a faixa é a largura, e o volume precisa ser
 * desprezível para não mover as proporções que estas afirmações medem.
 *
 * ⚠️ Ela existe porque a spec 100 mudou o padrão: viagem de várias paradas com caixa pequena passou
 * a sair em faixas paralelas à porta. As afirmações desta suíte são sobre **como a profundidade
 * divide o baú**, e sem fixar o arranjo elas passariam a descrever um desenho que não é o delas.
 */
function caixaQueNaoCabeEmFaixa(stopSequence: number, ladoMm: number): PlacementBox {
  return box({ heightMm: 50, label: 'LARGA', lengthMm: ladoMm, stopSequence, widthMm: ladoMm })
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
        caixaQueNaoCabeEmFaixa(3, 2_200),
      ],
    })
    const boxes = placed(plan)

    const third = extent(boxes, 3)
    const second = extent(boxes, 2)
    const first = extent(boxes, 1)

    expect(third.to).toBeLessThanOrEqual(second.from + 1e-9)
    expect(second.to).toBeLessThanOrEqual(first.from + 1e-9)
    /**
     * ⚠️ O bloco **termina na porta** e as fatias são contíguas entre si: o vão que sobra fica atrás
     * da última parada, na testeira. Espalhar as três pelos 7,4 m para a primeira encostar na porta
     * era o defeito — carga que cabia em dois metros ocupava o baú inteiro numa camada rasteira.
     */
    expect(first.to).toBeGreaterThan(7.4 - 0.7)
    expect(third.from).toBeGreaterThan(0)
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
        caixaQueNaoCabeEmFaixa(1, 2_200),
      ],
    })
    const boxes = placed(plan)

    /**
     * ⚠️ A **sobra** fica de fora, e sempre esteve: a carga dividida sobe para a região das paradas
     * entregues depois, por decisão da 095 G003, e sai marcada em vermelho no desenho. Ela só passou
     * a aparecer neste caso quando a esbeltez limitou a pilha (spec 100 G008) e mais carga transbordou
     * da própria fatia.
     */
    const inteiras = boxes.filter((entry) => !entry.reasons.includes('splitCargo'))
    const overlapping = inteiras.filter((entry) =>
      inteiras.some(
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
        /** Na parada grande, para não inflar a fatia pequena que esta afirmação compara. */
        caixaQueNaoCabeEmFaixa(2, 2_300),
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
      /**
       * ⚠️ Spec 100: a divisão só existe em profundidade — em faixas a parada que estoura a própria
       * faixa já encheu o baú. Esta caixa larga mantém a viagem no arranjo que esta suíte descreve.
       */
      caixaQueNaoCabeEmFaixa(2, 2_300),
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
      bed: { heightM: '2.300', lengthM: '4.000', source: 'measured' as const, widthM: '2.400' },
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

/**
 * Spec 098: **acima de metade do teto de massa a carga vai para o meio do baú.**
 *
 * ⚠️ Não é conferência de eixo — ela continua não existindo, e `axleNotChecked` continua no
 * vocabulário. É posição longitudinal: massa pendurada na traseira alivia o eixo dianteiro, e isso
 * se afirma sem saber onde os eixos estão.
 */
describe('o equilíbrio longitudinal (spec 098)', () => {
  const cargo = [
    box({ count: 12, label: 'P1', stopSequence: 1 }),
    box({ count: 12, label: 'P2', stopSequence: 2 }),
  ]

  const span = (ratio: string | null): { readonly from: number; readonly to: number } => {
    const boxes = placed(resolveCargoPlacement({ bed: BED, boxes: cargo, payloadRatio: ratio }))
    return {
      from: Math.min(...boxes.map((entry) => entry.xM)),
      to: Math.max(...boxes.map((entry) => entry.xM + entry.depthM)),
    }
  }

  test('carga leve encosta na porta, e a descarga manda', () => {
    expect(span('0.3000').to).toBeCloseTo(7.4, 6)
  })

  /**
   * ⚠️ O vão sobra **dos dois lados**, e é isso que centraliza: afirmar só "não encosta na porta"
   * passaria com a carga colada na testeira, que é o mesmo defeito virado ao contrário.
   */
  test('carga pesada centraliza, com folga nas duas pontas', () => {
    const heavy = span('0.8000')

    expect(heavy.from).toBeGreaterThan(0)
    expect(heavy.to).toBeLessThan(7.4)
    expect(heavy.from).toBeCloseTo(7.4 - heavy.to, 6)
  })

  /** Teto desconhecido não move nada: sem denominador não há proporção que justifique mover. */
  test('sem teto de massa a carga segue encostada na porta', () => {
    expect(span(null).to).toBeCloseTo(7.4, 6)
  })

  test('a carga equilibrada diz por que não está na porta', () => {
    const boxes = placed(resolveCargoPlacement({ bed: BED, boxes: cargo, payloadRatio: '0.8000' }))

    expect(boxes.every((entry) => entry.reasons.includes('weightBalanced'))).toBe(true)
  })

  /** ⚠️ Equilibrar não afrouxa a fatia: a ordem de entrega vale nos dois lados do degrau. */
  test('a ordem entre paradas sobrevive ao equilíbrio', () => {
    const boxes = placed(resolveCargoPlacement({ bed: BED, boxes: cargo, payloadRatio: '0.8000' }))
    const second = extent(boxes, 2)
    const first = extent(boxes, 1)

    expect(second.to).toBeLessThanOrEqual(first.from + 1e-9)
  })
})

/**
 * Spec 099: **por onde o veículo abre decide se existe porta a que encostar.**
 *
 * ⚠️ Encostar na porta serve para alcançar a carga. Num sider, que abre o comprimento inteiro, não
 * há "a porta" — toda a carga já está à mão, e o que sobra para decidir posição é o peso. É o que
 * `LOADING_ACCESS_KINDS` já dizia na definição de `open`.
 */
describe('a posição depende do acesso de carga (spec 099)', () => {
  const cargo = [
    box({ count: 12, label: 'P1', stopSequence: 1 }),
    box({ count: 12, label: 'P2', stopSequence: 2 }),
  ]

  test('carroceria aberta equilibra mesmo com carga leve', () => {
    const boxes = placed(
      resolveCargoPlacement({
        bed: BED,
        boxes: cargo,
        loadingAccess: 'open',
        payloadRatio: '0.1000',
      }),
    )
    const to = Math.max(...boxes.map((entry) => entry.xM + entry.depthM))

    expect(to).toBeLessThan(7.4)
  })

  /** ⚠️ Ausente é `rear`, o mais restritivo — supor lateral alcançaria baú que só abre atrás. */
  test('sem acesso declarado a carga encosta na porta', () => {
    const boxes = placed(resolveCargoPlacement({ bed: BED, boxes: cargo, payloadRatio: '0.1000' }))
    const to = Math.max(...boxes.map((entry) => entry.xM + entry.depthM))

    expect(to).toBeCloseTo(7.4, 6)
  })

  /** A lateral ajuda, mas a ordem ainda vale: `rear_and_side` segue o mesmo degrau de peso. */
  test('traseira e lateral seguem o degrau de peso, não o acesso', () => {
    const boxes = placed(
      resolveCargoPlacement({
        bed: BED,
        boxes: cargo,
        loadingAccess: 'rear_and_side',
        payloadRatio: '0.1000',
      }),
    )
    const to = Math.max(...boxes.map((entry) => entry.xM + entry.depthM))

    expect(to).toBeCloseTo(7.4, 6)
  })
})

/**
 * Spec 099: **gravidade — nenhuma caixa no ar.**
 *
 * ⚠️ A afirmação é sobre a **propriedade**, não sobre posições: percorre o arranjo inteiro e exige
 * que toda caixa esteja no piso ou tenha, debaixo dela, uma caixa cujo topo é exatamente o seu `z`.
 * Um teste que conferisse coordenadas conhecidas passaria a mentir na primeira mudança de heurística.
 */
describe('a gravidade (spec 099)', () => {
  const floating = (
    boxes: readonly ReturnType<typeof placed>[number][],
  ): readonly ReturnType<typeof placed>[number][] =>
    boxes.filter(
      (entry) =>
        entry.zM > 0 &&
        !boxes.some(
          (other) =>
            other !== entry &&
            Math.abs(other.zM + other.heightM - entry.zM) < 1e-6 &&
            other.xM < entry.xM + entry.depthM - 1e-9 &&
            entry.xM < other.xM + other.depthM - 1e-9 &&
            other.yM < entry.yM + entry.widthM - 1e-9 &&
            entry.yM < other.yM + other.widthM - 1e-9,
        ),
    )

  /**
   * ⚠️ **Alturas misturadas é o caso que revelou o defeito.** Com caixas de uma altura só, `z` bate
   * por coincidência aritmética e o arranjo parece certo — a caixa baixa sobre outra baixa era
   * erguida até o topo da caixa **alta** vizinha, e ficava com 0,6 m de ar embaixo.
   */
  test('nenhuma caixa fica no ar quando as alturas se misturam', () => {
    const boxes = placed(
      resolveCargoPlacement({
        bed: BED,
        boxes: [
          box({ count: 6, heightMm: 800, label: 'ALTA', lengthMm: 600, widthMm: 600 }),
          box({ count: 6, heightMm: 200, label: 'BAIXA', lengthMm: 600, widthMm: 600 }),
        ],
      }),
    )

    expect(boxes).not.toHaveLength(0)
    expect(floating(boxes)).toEqual([])
  })

  /**
   * ⚠️ **Medida que não é múltipla da célula do relevo é o caso que quase escapou.** Toda caixa dos
   * outros casos mede em múltiplos de 5 cm, e o arranjo saía certo por alinhamento — com 330 mm a
   * fronteira entre duas caixas encostadas cai no meio de uma célula, que foi como a escada nasceu.
   */
  test('nenhuma caixa fica no ar com medida fora da grade do relevo', () => {
    const boxes = placed(
      resolveCargoPlacement({
        bed: BED,
        boxes: [
          box({ count: 8, heightMm: 330, label: 'A', lengthMm: 330, widthMm: 330 }),
          box({ count: 8, heightMm: 170, label: 'B', lengthMm: 330, widthMm: 330 }),
        ],
      }),
    )

    expect(boxes).not.toHaveLength(0)
    expect(floating(boxes)).toEqual([])
  })

  /** A mesma propriedade com três paradas e tamanhos diferentes, que é o arranjo de verdade. */
  test('nenhuma caixa fica no ar com paradas e tamanhos variados', () => {
    const boxes = placed(
      resolveCargoPlacement({
        bed: BED,
        boxes: [
          box({
            count: 9,
            heightMm: 300,
            label: 'P1',
            lengthMm: 400,
            stopSequence: 1,
            widthMm: 300,
          }),
          box({
            count: 7,
            heightMm: 700,
            label: 'P2',
            lengthMm: 600,
            stopSequence: 2,
            widthMm: 500,
          }),
          box({
            count: 5,
            heightMm: 200,
            label: 'P3',
            lengthMm: 300,
            stopSequence: 3,
            widthMm: 800,
          }),
        ],
      }),
    )

    expect(boxes).not.toHaveLength(0)
    expect(floating(boxes)).toEqual([])
  })
})

/** O mesmo baú da spec 100: Fiorino furgão, 1,70 × 1,45 × 1,30 m. */
const FIORINO = {
  heightM: '1.300',
  lengthM: '1.700',
  source: 'measured' as const,
  widthM: '1.450',
} as const

/** A faixa que a parada ocupa ao longo da **largura** — o eixo que as faixas dividem. */
function lateral(boxes: readonly PlacedBox[], stopSequence: number): { from: number; to: number } {
  const own = boxes.filter((entry) => entry.stopSequence === stopSequence)
  return {
    from: Math.min(...own.map((entry) => entry.yM)),
    to: Math.max(...own.map((entry) => entry.yM + entry.widthM)),
  }
}

/**
 * **A carga fica paralela à porta** (spec 100).
 *
 * O arranjo em profundidade só funciona enquanto nada foge da ordem: com a parada 2 atrás da 1,
 * alcançá-la exige descarregar a 1 inteira. Medido na viagem que gerou a spec (Fiorino de 1,70 m,
 * três paradas): duas das três não eram alcançáveis pela porta, e as três cabiam lado a lado.
 */
describe('as faixas paralelas à porta (spec 100)', () => {
  const TRES_PARADAS = [1, 2, 3].map((stopSequence) =>
    box({ heightMm: 300, lengthMm: 400, stopSequence, widthMm: 300 }),
  )

  /**
   * ⚠️ **Toda parada encosta na porta** — é a definição do arranjo, e o que a crítica pediu. Uma
   * parada que começasse depois de outra ao longo do comprimento seria o defeito de volta.
   */
  test('toda parada tem caixa encostada na porta', () => {
    const boxes = placed(resolveCargoPlacement({ bed: FIORINO, boxes: TRES_PARADAS }))
    const portaM = Number.parseFloat(FIORINO.lengthM)

    for (const stopSequence of [1, 2, 3]) {
      const own = boxes.filter((entry) => entry.stopSequence === stopSequence)
      expect(own.length).toBeGreaterThan(0)
      expect(Math.max(...own.map((entry) => entry.xM + entry.depthM))).toBeCloseTo(portaM, 2)
    }
  })

  /** As faixas não se cruzam: cada parada tem a sua largura, e nada atravessa. */
  test('as faixas são contíguas e não se sobrepõem', () => {
    const boxes = placed(resolveCargoPlacement({ bed: FIORINO, boxes: TRES_PARADAS }))

    expect(lateral(boxes, 1).to).toBeLessThanOrEqual(lateral(boxes, 2).from + 0.001)
    expect(lateral(boxes, 2).to).toBeLessThanOrEqual(lateral(boxes, 3).from + 0.001)
  })

  /**
   * ⚠️ **A primeira entrega fica no lado da porta lateral**, que o desenho põe em `y = 0`. Sem um
   * lado fixo, duas viagens parecidas sairiam espelhadas e o operador não teria como prever nada.
   */
  test('a primeira entrega ocupa a faixa mais à mão', () => {
    const boxes = placed(resolveCargoPlacement({ bed: FIORINO, boxes: TRES_PARADAS }))

    expect(lateral(boxes, 1).from).toBeCloseTo(0, 3)
    expect(lateral(boxes, 3).from).toBeGreaterThan(lateral(boxes, 2).from)
  })

  /** Caixa nenhuma sai do baú depois da destroca de eixos — o erro clássico de girar coordenada. */
  test('nenhuma caixa atravessa a parede depois da rotação', () => {
    const boxes = placed(resolveCargoPlacement({ bed: FIORINO, boxes: TRES_PARADAS }))
    const comprimentoM = Number.parseFloat(FIORINO.lengthM)
    const larguraM = Number.parseFloat(FIORINO.widthM)

    for (const entry of boxes) {
      expect(entry.xM).toBeGreaterThanOrEqual(-0.001)
      expect(entry.xM + entry.depthM).toBeLessThanOrEqual(comprimentoM + 0.001)
      expect(entry.yM).toBeGreaterThanOrEqual(-0.001)
      expect(entry.yM + entry.widthM).toBeLessThanOrEqual(larguraM + 0.001)
    }
  })

  /**
   * ⚠️ O arranjo é decidido pela mesma política que a tabela consulta: com uma parada só, o desenho
   * volta a ser o de profundidade, e a caixa continua encostada na porta.
   */
  test('uma parada só continua saindo em profundidade', () => {
    const boxes = placed(
      resolveCargoPlacement({
        bed: FIORINO,
        boxes: [box({ count: 4, heightMm: 300, lengthMm: 400, stopSequence: 1, widthMm: 300 })],
      }),
    )

    expect(boxes.length).toBe(4)
    expect(Math.max(...boxes.map((entry) => entry.xM + entry.depthM))).toBeCloseTo(1.7, 2)
  })

  /**
   * ⚠️ **O vão sobra do lado oposto à primeira entrega, e nunca entre faixas.** Em profundidade a
   * 099 D2 empurra o bloco para terminar na porta; aqui isso poria justamente a primeira entrega
   * longe da porta lateral. A primeira faixa começa em zero, e o que sobra fica na lateral oposta.
   */
  test('o vão de largura sobra do lado oposto à primeira entrega', () => {
    const boxes = placed(resolveCargoPlacement({ bed: FIORINO, boxes: TRES_PARADAS }))
    const larguraM = Number.parseFloat(FIORINO.widthM)

    expect(lateral(boxes, 1).from).toBeCloseTo(0, 3)
    expect(lateral(boxes, 3).to).toBeLessThan(larguraM)
  })

  /**
   * ⚠️ **Caber em largura não é caber, e este é o defeito que a revisão pegou.**
   *
   * Duas paradas de uma caixa cada seguram 0,60 m de um baú de 1,45 m — o mínimo delas —, e a parada
   * dominante fica com uma faixa que não comporta o volume dela. Antes do teste de volume o arranjo
   * saía `lanes` e o empacotador descartava **15 de 57 caixas** como `bedFull` num baú **64% cheio**;
   * as mesmas 57 cabiam em profundidade. O operador lia "não coube" numa viagem que cabe, na tela em
   * que ele decide aceitar a carga.
   *
   * ⚠️ A contagem caiu de 57 para 32 quando a esbeltez limitou a pilha (spec 100 G008): com altura
   * útil de 0,90 m num baú de 1,30 m, 57 caixas deixaram de caber **de verdade**, e o contrato
   * passaria a afirmar o contrário do que mede.
   */
  test('carga que cabe é colocada, mesmo quando a faixa a estrangularia', () => {
    const plan = resolveCargoPlacement({
      bed: FIORINO,
      boxes: [
        box({ heightMm: 300, lengthMm: 400, stopSequence: 1, widthMm: 300 }),
        box({ heightMm: 300, lengthMm: 400, stopSequence: 2, widthMm: 300 }),
        box({ count: 30, heightMm: 300, lengthMm: 400, stopSequence: 3, widthMm: 300 }),
      ],
    })

    expect(placed(plan).length).toBe(32)
    expect(plan?.unplaced).toEqual([])
  })

  /**
   * ⚠️ A proibição da 095 G001 no eixo que a 100 escolheu: nenhuma caixa cruza para a largura de
   * outra parada. É o que faz a faixa ser faixa, e não uma tendência.
   */
  test('nenhuma parada invade a largura de outra', () => {
    const boxes = placed(resolveCargoPlacement({ bed: FIORINO, boxes: TRES_PARADAS }))

    const invadindo = boxes.filter((entry) =>
      boxes.some(
        (other) =>
          other.stopSequence !== entry.stopSequence &&
          entry.yM < other.yM + other.widthM - 1e-9 &&
          other.yM < entry.yM + entry.widthM - 1e-9,
      ),
    )

    expect(invadindo).toEqual([])
  })

  /**
   * ⚠️ **Em faixas sobe-se antes de andar para o fundo** (spec 100 G007), e é aqui que a feature
   * entrega o que promete: acesso pela porta não vale nada se a carga da parada corre baú adentro.
   *
   * A varredura enche fileiras e só sobe de camada quando elas acabam. Em profundidade a fileira
   * corre pela **largura**, que é de graça. Em faixas ela corre pela **profundidade real**, e cada
   * fileira nova empurra a carga um passo para dentro — medido na viagem real: seis caixas de 0,30 m
   * numa faixa de 0,40 m saíam deitadas no chão até **1,50 m** da porta, com uma só empilhada, num
   * baú de 1,30 m que comporta quatro camadas.
   */
  test('a carga sobe até o teto antes de avançar para o fundo', () => {
    const boxes = placed(
      resolveCargoPlacement({
        bed: FIORINO,
        boxes: [
          box({ count: 6, heightMm: 300, lengthMm: 400, stopSequence: 1, widthMm: 300 }),
          box({ count: 6, heightMm: 300, lengthMm: 400, stopSequence: 2, widthMm: 300 }),
        ],
      }),
    )
    const portaM = Number.parseFloat(FIORINO.lengthM)
    const alcance = portaM - Math.min(...boxes.map((entry) => entry.xM))

    expect(boxes.length).toBe(12)
    /** Seis caixas em quatro camadas cabem em duas faixas de 0,30 m. */
    expect(alcance).toBeLessThanOrEqual(0.61)
    /** E elas de fato empilham: uma carga rasteira teria uma camada só. */
    expect(new Set(boxes.map((entry) => entry.zM)).size).toBeGreaterThan(1)
  })

  /**
   * ⚠️ **Girar a caixa muda quantas cabem por fileira, e é isso que decide a profundidade.**
   *
   * A orientação era a primeira que coubesse. Numa faixa de 0,60 m uma caixa de 0,40 × 0,30 entrava
   * deitada e ia **uma** por fileira, quando de pé iam duas — e cada fileira custa 0,30 m de baú.
   * Medido na viagem real: 17 caixas alcançavam 1,50 m da porta, e cabem em 1,20 m.
   *
   * ⚠️ O rendimento é **caixas por metro do eixo caro**, não a menor dimensão: escolher a orientação
   * mais estreita punha uma por fileira e gastava mais profundidade, que é o oposto do objetivo.
   */
  test('a caixa é girada para render mais por fileira', () => {
    const boxes = placed(
      resolveCargoPlacement({
        bed: FIORINO,
        boxes: [
          box({ count: 4, heightMm: 300, lengthMm: 400, stopSequence: 1, widthMm: 300 }),
          box({ count: 4, heightMm: 300, lengthMm: 400, stopSequence: 2, widthMm: 300 }),
          box({ count: 17, heightMm: 300, lengthMm: 400, stopSequence: 3, widthMm: 300 }),
        ],
      }),
    )
    const daTerceira = boxes.filter((entry) => entry.stopSequence === 3)
    const alcance = Number.parseFloat(FIORINO.lengthM) - Math.min(...daTerceira.map((e) => e.xM))

    expect(daTerceira.length).toBe(17)
    expect(alcance).toBeLessThanOrEqual(1.21)
  })

  /**
   * ⚠️ **A faixa nasce do tamanho da alocação, e não cresce por etapas.** O crescimento existe para a
   * fatia em profundidade (099 D1), onde o que sobra vira vão na testeira. Em faixas o que sobra da
   * largura não vira vão útil — a faixa seguinte só começa antes —, e a carga desta paga a diferença
   * em profundidade. Pior: crescer por etapas decidia a orientação contra uma largura provisória.
   */
  test('a faixa usa a largura que lhe cabe, em vez de economizar largura e gastar fundo', () => {
    const boxes = placed(
      resolveCargoPlacement({
        bed: FIORINO,
        boxes: [1, 2, 3].map((stopSequence) =>
          box({ count: 8, heightMm: 300, lengthMm: 400, stopSequence, widthMm: 300 }),
        ),
      }),
    )
    const larguraOcupada = Math.max(...boxes.map((entry) => entry.yM + entry.widthM))

    /** As três faixas somadas cobrem quase toda a largura útil do baú. */
    expect(larguraOcupada).toBeGreaterThan(1.1)
  })

  /**
   * ⚠️ **Em profundidade a ordem continua a de sempre.** Ali a fileira corre pela largura do baú, e
   * avançá-la não afasta ninguém da porta: encher o chão antes de empilhar é o certo, e inverter
   * isso empilharia carga com metade do piso vazio ao lado.
   */
  test('em profundidade a fileira continua enchendo o chão primeiro', () => {
    const boxes = placed(
      resolveCargoPlacement({
        bed: BED,
        boxes: [
          box({ count: 4, stopSequence: 1 }),
          caixaQueNaoCabeEmFaixa(2, 2_300),
          box({ count: 4, stopSequence: 2 }),
        ],
      }),
    )
    const daParada1 = boxes.filter((entry) => entry.stopSequence === 1)

    /** As quatro cabem lado a lado na largura, sem ninguém subir. */
    expect(daParada1.every((entry) => entry.zM === 0)).toBe(true)
  })

  /**
   * ⚠️ **A pilha tem teto de estabilidade, e ele é geométrico** (spec 100 G008).
   *
   * Sem `max_stack_count` cadastrado o limite era infinito e a varredura subia até o teto do baú.
   * Numa prateleira isso passa; num veículo em movimento não — a pilha tomba quando a inclinação
   * equivalente passa de `tan⁻¹(base ÷ altura)`, e a 3:1 isso é 0,33 g, o que uma curva forte faz.
   *
   * ⚠️ **A massa não entra, e é física, não simplificação:** ela cancela nos dois lados da condição de
   * tombamento. Medido nesta base, `gross_weight_grams` existe em **4 de 663** caixas — uma regra de
   * peso não rodaria em 99,4% das cargas.
   */
  test('a pilha não passa de três vezes a menor dimensão da base', () => {
    const boxes = placed(
      resolveCargoPlacement({
        bed: FIORINO,
        boxes: [1, 2].map((stopSequence) =>
          box({ count: 12, heightMm: 300, lengthMm: 400, stopSequence, widthMm: 300 }),
        ),
      }),
    )
    const topo = Math.max(...boxes.map((entry) => entry.zM + entry.heightM))

    /** Base de 0,30 m × 3 = 0,90 m, e o baú tem 1,30 m de altura livre. */
    expect(topo).toBeLessThanOrEqual(0.91)
    /** E ela de fato empilha: a trava é teto, não proibição. */
    expect(topo).toBeGreaterThan(0.3)
  })

  /**
   * ⚠️ **A caixa baixa e larga sobe mais, e a alta e estreita sobe menos** — é a mesma regra, e é o
   * que a distingue de um número fixo de camadas. Quatro caixas de 10 cm são 40 cm de pilha e não
   * preocupam ninguém; quatro de 40 cm são 1,60 m e preocupam.
   */
  test('o teto acompanha a forma da caixa, não a contagem', () => {
    const rasa = placed(
      resolveCargoPlacement({
        bed: FIORINO,
        boxes: [1, 2].map((stopSequence) =>
          box({ count: 12, heightMm: 100, lengthMm: 400, stopSequence, widthMm: 300 }),
        ),
      }),
    )
    const camadasRasas = new Set(rasa.map((entry) => entry.zM)).size

    /** Base 0,30 m → teto 0,90 m; com caixa de 0,10 m isso são nove camadas, não três. */
    expect(camadasRasas).toBeGreaterThan(3)
  })

  /** A física vence: acima de metade do teto de massa a carga volta a se dividir em profundidade. */
  test('carga pesada volta ao arranjo em profundidade', () => {
    const boxes = placed(
      resolveCargoPlacement({ bed: FIORINO, boxes: TRES_PARADAS, payloadRatio: '0.7000' }),
    )
    const primeira = lateral(boxes, 1)
    const terceira = lateral(boxes, 3)

    /** Em profundidade as três dividem a mesma largura, e é o `x` que as separa. */
    expect(primeira.from).toBeCloseTo(terceira.from, 3)
  })
})
