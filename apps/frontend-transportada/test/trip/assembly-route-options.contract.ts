/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 096 T3: o que a montagem imprime por opção de rota. `resolveRouteOptionSummaries` é puro —
 * este é o contrato do cálculo, no molde de `test/trip/assembly-toll.contract.ts`.
 */
import { describe, expect, it } from 'bun:test'

import {
  resolveAssemblyRouteChoice,
  buildRouteChoiceSignatureKey,
  resolveRouteChoiceEmission,
  resolveRouteOptionSummaries,
  resolveSelectedOptionIndex,
  type RouteGeometryForEmission,
} from '../../src/modules/trip/shared/assemblyRouteOptions.service'
import type { RouteGeometryOption } from '../../src/modules/trip/shared/routeGeometry.service'

function opcao(input: {
  readonly boothCount?: number
  readonly distanceMeters: number
  readonly durationSeconds: number
  readonly isNoToll?: boolean
  readonly signature?: string
  readonly totalCost: null | string
}): RouteGeometryOption {
  return {
    distanceMeters: input.distanceMeters,
    durationSeconds: input.durationSeconds,
    fuelTotal: null,
    isNoToll: input.isNoToll ?? false,
    legs: [],
    points: [],
    signature: input.signature ?? null,
    toll:
      input.boothCount === undefined
        ? null
        : {
            axles: { count: 2, source: 'declared' },
            catalog: { observedOn: '2026-07-01', status: 'current' },
            booths: Array.from({ length: input.boothCount }, (_unused, index) => ({
              chargeCar: null,
              chargePerAxle: null,
              latitude: '-21.9000000',
              longitude: '-47.5000000',
              name: `Praça ${index}`,
              operator: null,
              effectiveChargePerAxle: null,
              fellBackToManual: false,
              total: null,
              osmNodeId: index,
            })),
            boothsFallenBackToManual: 0,
            multiplierLabel: '2',
            boothsWithoutCharge: 0,
            chargePerAxle: '0.0000',
            paymentMode: 'manual',
            tariffObservedOn: null,
            total: '0.0000',
          },
    totalCost: input.totalCost,
  }
}

/** Ribeirão Preto → Campinas medido: a principal com cinco praças, a alternativa com quatro. */
const CAMPINAS: readonly RouteGeometryOption[] = [
  opcao({
    boothCount: 5,
    distanceMeters: 221_500,
    durationSeconds: 179 * 60,
    totalCost: '500.9713',
  }),
  opcao({
    boothCount: 4,
    distanceMeters: 239_600,
    durationSeconds: 198 * 60,
    totalCost: '517.6340',
  }),
]

describe('resumo das opções de rota (spec 096 T3)', () => {
  it('converte metro e segundo para quilômetro e minuto, na ordem que a rota chegou', () => {
    const resumo = resolveRouteOptionSummaries({
      cheapestIndex: 0,
      fastestIndex: 0,
      options: CAMPINAS,
    })

    expect(resumo[0]?.distanceKilometres).toBeCloseTo(221.5)
    expect(resumo[0]?.minutes).toBe(179)
    expect(resumo[0]?.boothCount).toBe(5)
    expect(resumo[1]?.distanceKilometres).toBeCloseTo(239.6)
    expect(resumo[1]?.minutes).toBe(198)
    expect(resumo[1]?.boothCount).toBe(4)
  })

  /**
   * ⚠️ O caso medido de Campinas: a mesma rota é a mais rápida e a mais barata — e isso é
   * informação, não bug (spec 096). `isBestOfBoth` existe para a tela imprimir uma marca só.
   */
  it('marca a mesma rota como a melhor nas duas contas quando ela vence as duas', () => {
    const resumo = resolveRouteOptionSummaries({
      cheapestIndex: 0,
      fastestIndex: 0,
      options: CAMPINAS,
    })

    expect(resumo[0]?.isBestOfBoth).toBe(true)
    expect(resumo[0]?.isFastest).toBe(true)
    expect(resumo[0]?.isCheapest).toBe(true)
    expect(resumo[1]?.isBestOfBoth).toBe(false)
  })

  it('separa a marca quando a mais rápida e a mais barata são rotas diferentes', () => {
    const resumo = resolveRouteOptionSummaries({
      cheapestIndex: 1,
      fastestIndex: 0,
      options: CAMPINAS,
    })

    expect(resumo[0]?.isFastest).toBe(true)
    expect(resumo[0]?.isCheapest).toBe(false)
    expect(resumo[0]?.isBestOfBoth).toBe(false)
    expect(resumo[1]?.isCheapest).toBe(true)
    expect(resumo[1]?.isFastest).toBe(false)
  })

  /** Sem consumo/preço declarado nenhuma opção é a mais barata — nunca inventar o índice. */
  it('nenhuma opção fica marcada como mais barata quando o índice é nulo', () => {
    const resumo = resolveRouteOptionSummaries({
      cheapestIndex: null,
      fastestIndex: 0,
      options: CAMPINAS,
    })

    expect(resumo.every((linha) => !linha.isCheapest)).toBe(true)
    expect(resumo.every((linha) => !linha.isBestOfBoth)).toBe(true)
  })

  it('o total é o que a política mandou, sem recalcular nada', () => {
    const resumo = resolveRouteOptionSummaries({
      cheapestIndex: 0,
      fastestIndex: 0,
      options: CAMPINAS,
    })

    expect(resumo[0]?.totalCost).toBe('500.9713')
    expect(resumo[1]?.totalCost).toBe('517.6340')
  })
})

describe('opção sem pedágio calculado (revisão de 2026-09-07)', () => {
  /**
   * ⚠️ `toll` nulo é **desconhecido**, e colapsá-lo em `0` faz a linha do seletor afirmar que a
   * alternativa não passa por praça nenhuma — na única superfície que o operador lê para escolher.
   * O `totalCost` já se escondia quando nulo; a contagem de praças não.
   */
  it('não conta zero praça quando o pedágio da opção não pôde ser calculado', () => {
    const [resumo] = resolveRouteOptionSummaries({
      cheapestIndex: null,
      fastestIndex: 0,
      options: [
        {
          distanceMeters: 239_600,
          durationSeconds: 11_880,
          fuelTotal: null,
          isNoToll: false,
          legs: [],
          points: [],
          signature: null,
          toll: null,
          totalCost: null,
        },
      ],
    })

    expect(resumo?.boothCount).toBeNull()
  })

  it('conta as praças quando o pedágio foi calculado, inclusive zero medido', () => {
    const [semPraca] = resolveRouteOptionSummaries({
      cheapestIndex: 0,
      fastestIndex: 0,
      options: [
        {
          distanceMeters: 100_000,
          durationSeconds: 3_600,
          fuelTotal: '100.0000',
          isNoToll: false,
          legs: [],
          points: [],
          signature: null,
          toll: {
            axles: { count: 2, source: 'declared' },
            catalog: { observedOn: '2026-07-01', status: 'current' },
            booths: [],
            boothsFallenBackToManual: 0,
            multiplierLabel: '2',
            boothsWithoutCharge: 0,
            chargePerAxle: '0.0000',
            paymentMode: 'manual',
            tariffObservedOn: null,
            total: '0.0000',
          },
          totalCost: '100.0000',
        },
      ],
    })

    expect(semPraca?.boothCount).toBe(0)
  })
})

/**
 * Spec 165 CA01/CA03: de qual chamada a opção veio é o que a lista precisa para dizer "sem
 * pedágio". Zero praça não basta — a rota comum que não passa por praça também tem zero, e as duas
 * linhas seriam indistinguíveis.
 */
describe('opção que evita pedágio (spec 165)', () => {
  it('marca a opção que veio da chamada sem pedágio, e só ela', () => {
    const resumos = resolveRouteOptionSummaries({
      cheapestIndex: null,
      fastestIndex: null,
      options: [
        opcao({ boothCount: 3, distanceMeters: 376_500, durationSeconds: 18_000, totalCost: null }),
        opcao({
          boothCount: 0,
          distanceMeters: 372_600,
          durationSeconds: 18_600,
          isNoToll: true,
          totalCost: null,
        }),
      ],
    })

    expect(resumos.map((resumo) => resumo.isNoToll)).toEqual([false, true])
  })

  it('acumula com a marca de mais barata quando evitar pedágio também sai mais em conta', () => {
    const [, semPedagio] = resolveRouteOptionSummaries({
      cheapestIndex: 1,
      fastestIndex: 0,
      options: [
        opcao({
          boothCount: 3,
          distanceMeters: 376_500,
          durationSeconds: 18_000,
          totalCost: '532.7000',
        }),
        opcao({
          boothCount: 0,
          distanceMeters: 372_600,
          durationSeconds: 18_600,
          isNoToll: true,
          totalCost: '500.0000',
        }),
      ],
    })

    expect(semPedagio?.isNoToll).toBe(true)
    expect(semPedagio?.isCheapest).toBe(true)
    expect(semPedagio?.isFastest).toBe(false)
  })

  it('a opção sem pedágio calculado ainda diz de onde veio', () => {
    const [semPedagio] = resolveRouteOptionSummaries({
      cheapestIndex: null,
      fastestIndex: null,
      options: [
        opcao({
          distanceMeters: 372_600,
          durationSeconds: 18_600,
          isNoToll: true,
          totalCost: null,
        }),
      ],
    })

    expect(semPedagio?.isNoToll).toBe(true)
    expect(semPedagio?.boothCount).toBeNull()
  })
})

/**
 * Spec 153 D2/D3: a rota que o operador viu na montagem vai junto ao planejar, pela **assinatura** —
 * o índice de agora é outra estrada quando a API pede as rotas de novo. O critério só vale quando a
 * assinatura não é reencontrada.
 */
describe('escolha de rota enviada ao planejar (spec 153)', () => {
  const OPCOES: readonly RouteGeometryOption[] = [
    opcao({
      distanceMeters: 213_500,
      durationSeconds: 170 * 60,
      signature: 'principal',
      totalCost: '517.6340',
    }),
    opcao({
      distanceMeters: 224_900,
      durationSeconds: 185 * 60,
      signature: 'barata',
      totalCost: '500.9713',
    }),
    opcao({
      distanceMeters: 230_000,
      durationSeconds: 190 * 60,
      signature: 'outra',
      totalCost: '530.0000',
    }),
  ]

  it('rota única não é escolha: nada vai ao servidor', () => {
    expect(
      resolveAssemblyRouteChoice({
        cheapestIndex: 0,
        fastestIndex: 0,
        hasChoice: false,
        options: OPCOES.slice(0, 1),
        selectedIndex: 0,
      }),
    ).toBeUndefined()
  })

  it('a mais barata escolhida vai como cheapest, com a assinatura dela', () => {
    expect(
      resolveAssemblyRouteChoice({
        cheapestIndex: 1,
        fastestIndex: 0,
        hasChoice: true,
        options: OPCOES,
        selectedIndex: 1,
      }),
    ).toEqual({ criterion: 'cheapest', signature: 'barata' })
  })

  it('a mais rápida escolhida vai como fastest', () => {
    expect(
      resolveAssemblyRouteChoice({
        cheapestIndex: 1,
        fastestIndex: 0,
        hasChoice: true,
        options: OPCOES,
        selectedIndex: 0,
      }),
    ).toEqual({ criterion: 'fastest', signature: 'principal' })
  })

  /** A rota da chamada `exclude=toll` tem regra própria no servidor: sem assinatura, ela ainda casa. */
  it('a rota sem pedágio escolhida vai como no_toll', () => {
    const opcoes = [
      ...OPCOES.slice(0, 2),
      opcao({
        distanceMeters: 240_000,
        durationSeconds: 200 * 60,
        isNoToll: true,
        signature: 'sem-pedagio',
        totalCost: '540.0000',
      }),
    ]

    expect(
      resolveAssemblyRouteChoice({
        cheapestIndex: 1,
        fastestIndex: 0,
        hasChoice: true,
        options: opcoes,
        selectedIndex: 2,
      }),
    ).toEqual({ criterion: 'no_toll', signature: 'sem-pedagio' })
  })

  it('a que não é nem a mais barata nem a mais rápida vai como alternative', () => {
    expect(
      resolveAssemblyRouteChoice({
        cheapestIndex: 1,
        fastestIndex: 0,
        hasChoice: true,
        options: OPCOES,
        selectedIndex: 2,
      }),
    ).toEqual({ criterion: 'alternative', signature: 'outra' })
  })

  /** Sem custo comparável a mais barata não existe — a rota vista vai pela assinatura, sem rótulo. */
  it('sem mais barata conhecida a principal vista vai como alternative, pela assinatura', () => {
    expect(
      resolveAssemblyRouteChoice({
        cheapestIndex: null,
        fastestIndex: 1,
        hasChoice: true,
        options: OPCOES,
        selectedIndex: 0,
      }),
    ).toEqual({ criterion: 'alternative', signature: 'principal' })
  })
})

function opcaoComAssinatura(input: {
  readonly isNoToll?: boolean
  readonly signature: null | string
}): RouteGeometryOption {
  return {
    distanceMeters: 100_000,
    durationSeconds: 3_600,
    fuelTotal: null,
    isNoToll: input.isNoToll ?? false,
    legs: [],
    points: [],
    signature: input.signature,
    toll: null,
    totalCost: null,
  }
}

describe('resolveSelectedOptionIndex (spec 153 T709a/D2/L1): a assinatura gravada vence o critério', () => {
  const OPTIONS: readonly RouteGeometryOption[] = [
    opcaoComAssinatura({ signature: 'aaaa' }),
    opcaoComAssinatura({ isNoToll: true, signature: 'bbbb' }),
    opcaoComAssinatura({ signature: 'cccc' }),
  ]

  /**
   * Caso do achado L1: viagem congelada com critério `no_toll`, cuja assinatura está entre as
   * opções vivas. Antes, o switch caía direto no `cheapestIndex` (índice 0) e marcava uma rota
   * diferente da gravada — aqui a assinatura tem que vencer.
   */
  it('critério no_toll com assinatura reproduzida marca a opção da assinatura, não a mais barata', () => {
    const index = resolveSelectedOptionIndex({
      cheapestIndex: 0,
      criterion: 'no_toll',
      fastestIndex: 2,
      options: OPTIONS,
      selectedSignature: 'bbbb',
    })

    expect(index).toBe(1)
  })

  it('critério alternative com assinatura reproduzida marca a opção da assinatura', () => {
    const index = resolveSelectedOptionIndex({
      cheapestIndex: 0,
      criterion: 'alternative',
      fastestIndex: 2,
      options: OPTIONS,
      selectedSignature: 'cccc',
    })

    expect(index).toBe(2)
  })

  it('assinatura ausente das opções vivas cai no critério (D3: a estrada pode ter mudado)', () => {
    const index = resolveSelectedOptionIndex({
      cheapestIndex: 0,
      criterion: 'no_toll',
      fastestIndex: 2,
      options: OPTIONS,
      selectedSignature: 'nao-existe-mais',
    })

    expect(index).toBe(0)
  })

  it('sem assinatura gravada (null), cai direto no critério — mesmo comportamento de sempre', () => {
    const index = resolveSelectedOptionIndex({
      cheapestIndex: 0,
      criterion: 'fastest',
      fastestIndex: 2,
      options: OPTIONS,
      selectedSignature: null,
    })

    expect(index).toBe(2)
  })

  it('cheapest continua marcando a mais barata quando a assinatura bate com ela mesma', () => {
    const index = resolveSelectedOptionIndex({
      cheapestIndex: 0,
      criterion: 'cheapest',
      fastestIndex: 2,
      options: OPTIONS,
      selectedSignature: 'aaaa',
    })

    expect(index).toBe(0)
  })
})

/**
 * Segunda revisão da spec 153, N4 (regressão da T702): o efeito de `TripAssemblyMap` que reemite
 * `onRouteChoiceChange` não pode depender da *identidade* de `geometryQuery.data` — o TanStack
 * Query devolve um objeto novo a cada resposta, inclusive um refetch de foco sem nada relevante
 * mudado, e depender da referência resetava o índice e apagava a escolha do operador (RF13 ao
 * contrário). `buildRouteChoiceSignatureKey` é a chave por **conteúdo** que substitui a referência
 * no array de dependências do efeito.
 */
const EMISSION_OPTIONS: readonly RouteGeometryOption[] = [
  opcaoComAssinatura({ signature: 'aaaa' }),
  opcaoComAssinatura({ isNoToll: true, signature: 'bbbb' }),
  opcaoComAssinatura({ signature: 'cccc' }),
]

describe('buildRouteChoiceSignatureKey (spec 153, segunda revisão N4): chave por conteúdo, não por referência', () => {
  function geometria(overrides: Partial<RouteGeometryForEmission> = {}): RouteGeometryForEmission {
    return {
      cheapestIndex: 0,
      fastestIndex: 1,
      options: EMISSION_OPTIONS,
      selectedIndex: 0,
      ...overrides,
    }
  }

  it('ausência de resposta (undefined) tem chave null', () => {
    expect(buildRouteChoiceSignatureKey(undefined)).toBeNull()
  })

  /**
   * ⚠️ O experimento vermelho do achado: duas respostas **diferentes objetos**, mesmo conteúdo.
   * Antes da correção, o efeito dependia diretamente do objeto (`geometryQuery.data`) — e
   * `first === second` já prova que a referência muda a cada resposta, mesmo sem nada relevante
   * ter mudado. `buildRouteChoiceSignatureKey` existe para o efeito parar de reagir a isso.
   */
  it('duas respostas com o mesmo conteúdo e referências diferentes produzem a mesma chave', () => {
    const first = geometria()
    const second = { ...geometria() }

    expect(first).not.toBe(second)
    expect(buildRouteChoiceSignatureKey(first)).toBe(buildRouteChoiceSignatureKey(second))
  })

  it('muda quando o índice selecionado muda', () => {
    const chave1 = buildRouteChoiceSignatureKey(geometria({ selectedIndex: 0 }))
    const chave2 = buildRouteChoiceSignatureKey(geometria({ selectedIndex: 1 }))

    expect(chave1).not.toBe(chave2)
  })

  it('muda quando cheapestIndex/fastestIndex mudam', () => {
    const chave1 = buildRouteChoiceSignatureKey(geometria({ cheapestIndex: 0 }))
    const chave2 = buildRouteChoiceSignatureKey(geometria({ cheapestIndex: 1 }))

    expect(chave1).not.toBe(chave2)
  })

  it('muda quando a assinatura de uma opção muda, mesmo com os índices iguais', () => {
    const chave1 = buildRouteChoiceSignatureKey(geometria({ options: EMISSION_OPTIONS }))
    const chave2 = buildRouteChoiceSignatureKey(
      geometria({
        options: [
          opcaoComAssinatura({ signature: 'diferente' }),
          EMISSION_OPTIONS[1] as RouteGeometryOption,
        ],
      }),
    )

    expect(chave1).not.toBe(chave2)
  })

  /**
   * Terceira revisão, T903 (P4): sem `exclude=toll` anotado o roteirizador não manda `signature`
   * nenhuma — `null` em toda opção, o caso comum, não a exceção. O caso do achado: mesma contagem
   * de opções, mesmos índices, mas `distanceMeters`/`durationSeconds` diferentes (estradas
   * realmente distintas) — a chave tinha que distinguir isso sem depender da assinatura ausente.
   */
  it('sem assinatura em nenhuma opção, duas estradas diferentes produzem chaves diferentes (achado P4)', () => {
    const semAssinatura = (
      distanceMeters: number,
      durationSeconds: number,
    ): RouteGeometryOption => ({
      distanceMeters,
      durationSeconds,
      fuelTotal: null,
      legs: [],
      points: [],
      signature: null,
      toll: null,
      totalCost: null,
    })

    const chave1 = buildRouteChoiceSignatureKey(
      geometria({
        options: [semAssinatura(100_000, 3_600), semAssinatura(120_000, 4_200)],
      }),
    )
    const chave2 = buildRouteChoiceSignatureKey(
      geometria({
        options: [semAssinatura(105_500, 3_900), semAssinatura(130_200, 4_500)],
      }),
    )

    expect(chave1).not.toBe(chave2)
  })

  it('sem assinatura em nenhuma opção, o mesmo conteúdo produz a mesma chave', () => {
    const semAssinatura = (
      distanceMeters: number,
      durationSeconds: number,
    ): RouteGeometryOption => ({
      distanceMeters,
      durationSeconds,
      fuelTotal: null,
      legs: [],
      points: [],
      signature: null,
      toll: null,
      totalCost: null,
    })

    const chave1 = buildRouteChoiceSignatureKey(
      geometria({ options: [semAssinatura(100_000, 3_600), semAssinatura(120_000, 4_200)] }),
    )
    const chave2 = buildRouteChoiceSignatureKey(
      geometria({ options: [semAssinatura(100_000, 3_600), semAssinatura(120_000, 4_200)] }),
    )

    expect(chave1).toBe(chave2)
  })

  it('a quantidade de opções entra na chave, mesmo com as mesmas assinaturas nas primeiras posições', () => {
    const chave1 = buildRouteChoiceSignatureKey(
      geometria({ options: [opcaoComAssinatura({ signature: 'aaaa' })] }),
    )
    const chave2 = buildRouteChoiceSignatureKey(
      geometria({
        options: [
          opcaoComAssinatura({ signature: 'aaaa' }),
          opcaoComAssinatura({ signature: 'bbbb' }),
        ],
      }),
    )

    expect(chave1).not.toBe(chave2)
  })
})

describe('resolveRouteChoiceEmission (spec 153 H1/M7): índice de abertura e escolha, da mesma resposta', () => {
  it('abre no selectedIndex que a API resolveu, e a escolha bate com resolveRouteChoiceFromIndex', () => {
    const emissao = resolveRouteChoiceEmission({
      cheapestIndex: 0,
      fastestIndex: 2,
      options: EMISSION_OPTIONS,
      selectedIndex: 1,
    })

    expect(emissao.selectedIndex).toBe(1)
    expect(emissao.routeChoice).toEqual({ criterion: 'no_toll', signature: 'bbbb' })
  })

  /** Sem `selectedIndex` na resposta, abre em 0 — nunca fixo nem inventado por conta própria. */
  it('sem selectedIndex na resposta, abre no índice 0', () => {
    const emissao = resolveRouteChoiceEmission({
      cheapestIndex: 0,
      fastestIndex: 2,
      options: EMISSION_OPTIONS,
    })

    expect(emissao.selectedIndex).toBe(0)
    expect(emissao.routeChoice.criterion).toBe('cheapest')
  })
})
