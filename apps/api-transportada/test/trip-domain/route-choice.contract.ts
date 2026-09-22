/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 D2/D3: a rota escolhida é identificada por **assinatura**, e a assinatura que não se
 * reproduz cai no critério **dizendo que caiu**.
 *
 * As duas metades são o ponto da feature. Índice depende da ordem em que o OSRM devolveu e de quais
 * alternativas foram descartadas — na segunda chamada ele já é outra rota. E afirmar em silêncio
 * uma rota que não é a escolhida é o defeito que a D3 existe para acabar: o operador escolheu a sem
 * pedágio, a viagem gravou a principal, e a conta apareceu maior sem uma linha explicando.
 */
import { describe, expect, it } from 'bun:test'

import {
  buildRouteSignature,
  selectRouteOption,
  type RouteChoiceCriterion,
  type SelectableRouteOption,
} from '../../src/trips/domain/route-choice.policy.js'

const RIBEIRAO_FRANCA: readonly (readonly number[])[] = [
  [2_871_004, 2_871_005, 2_871_006],
  [2_871_007, 2_871_008],
]

const RIBEIRAO_FRANCA_SEM_PEDAGIO: readonly (readonly number[])[] = [
  [2_871_004, 4_119_220, 4_119_221],
  [4_119_222, 2_871_008],
]

function optionOf(overrides: Partial<SelectableRouteOption>): SelectableRouteOption {
  return {
    distanceMeters: 89_301,
    durationSeconds: 4_186,
    fuelTotal: '100.00',
    isNoToll: false,
    signature: null,
    tollTotal: '30.00',
    totalCost: '130.00',
    ...overrides,
  }
}

describe('a assinatura da rota (spec 153 D2)', () => {
  it('é estável: a mesma estrada, pedida duas vezes, devolve a mesma assinatura', () => {
    const primeira = buildRouteSignature({ nodeIdsByLeg: RIBEIRAO_FRANCA })
    const segunda = buildRouteSignature({
      nodeIdsByLeg: RIBEIRAO_FRANCA.map((leg) => [...leg]),
    })

    expect(primeira).toBe(segunda)
    expect(primeira).toMatch(/^[0-9a-f]{32}$/u)
  })

  it('distingue estradas diferentes', () => {
    expect(buildRouteSignature({ nodeIdsByLeg: RIBEIRAO_FRANCA })).not.toBe(
      buildRouteSignature({ nodeIdsByLeg: RIBEIRAO_FRANCA_SEM_PEDAGIO }),
    )
  })

  /**
   * ⚠️ O motivo de a assinatura sair dos nós **por perna**, não da lista achatada: a deduplicação do
   * gateway atravessa o limite do trecho, então duas rotas que só diferem em onde a parada cai
   * achatam para a mesma sequência. Assinatura igual para rotas diferentes é colisão silenciosa.
   */
  it('distingue rotas que achatam para a mesma sequência mas partem as pernas em lugares diferentes', () => {
    expect(
      buildRouteSignature({
        nodeIdsByLeg: [
          [1, 2, 3],
          [4, 5],
        ],
      }),
    ).not.toBe(
      buildRouteSignature({
        nodeIdsByLeg: [
          [1, 2],
          [3, 4, 5],
        ],
      }),
    )
  })

  /**
   * ⚠️ Sem anotação de nós não há assinatura — e é a assinatura nula que faz a D3 cair no critério.
   * Um hash do vazio daria a **mesma** assinatura para toda rota sem anotação, e a primeira delas
   * seria "reproduzida" para sempre.
   */
  it('não assina rota sem anotação de nós', () => {
    expect(buildRouteSignature({ nodeIdsByLeg: null })).toBeNull()
  })

  it('não assina rota cuja anotação não trouxe nó nenhum', () => {
    expect(buildRouteSignature({ nodeIdsByLeg: [] })).toBeNull()
    expect(buildRouteSignature({ nodeIdsByLeg: [[], []] })).toBeNull()
  })
})

describe('a escolha da rota (spec 153 D1/D3)', () => {
  const PRINCIPAL = optionOf({ signature: 'aaaa', totalCost: '130.00' })
  const MAIS_BARATA = optionOf({ durationSeconds: 6_000, signature: 'bbbb', totalCost: '110.00' })
  const SEM_PEDAGIO = optionOf({
    durationSeconds: 6_486,
    isNoToll: true,
    signature: 'cccc',
    tollTotal: '0.00',
    totalCost: '120.00',
  })
  const OPCOES = [PRINCIPAL, MAIS_BARATA, SEM_PEDAGIO] as const

  it('devolve a opção da assinatura quando ela está entre as ofertas', () => {
    const escolhida = selectRouteOption({
      choice: { criterion: 'cheapest', signature: 'cccc' },
      options: OPCOES,
    })

    expect(escolhida?.option).toBe(SEM_PEDAGIO)
    expect(escolhida?.reproduced).toBe(true)
  })

  /** O coração da D3: cai no critério **e** diz que caiu. */
  it('cai no critério e marca não reproduzida quando a assinatura sumiu', () => {
    const escolhida = selectRouteOption({
      choice: { criterion: 'cheapest', signature: 'nao-existe-mais' },
      options: OPCOES,
    })

    expect(escolhida?.option).toBe(MAIS_BARATA)
    expect(escolhida?.reproduced).toBe(false)
  })

  it('sem assinatura nenhuma aplica o critério e não acusa falha de reprodução', () => {
    const escolhida = selectRouteOption({
      choice: { criterion: 'cheapest', signature: null },
      options: OPCOES,
    })

    expect(escolhida?.option).toBe(MAIS_BARATA)
    expect(escolhida?.reproduced).toBe(true)
  })

  it('`fastest` é a de menor duração', () => {
    const escolhida = selectRouteOption({
      choice: { criterion: 'fastest', signature: null },
      options: OPCOES,
    })

    expect(escolhida?.option).toBe(PRINCIPAL)
  })

  it('`no_toll` é a rota marcada como sem pedágio', () => {
    const escolhida = selectRouteOption({
      choice: { criterion: 'no_toll', signature: null },
      options: OPCOES,
    })

    expect(escolhida?.option).toBe(SEM_PEDAGIO)
    expect(escolhida?.reproduced).toBe(true)
  })

  it('`alternative` cai em `cheapest`', () => {
    const escolhida = selectRouteOption({
      choice: { criterion: 'alternative', signature: null },
      options: OPCOES,
    })

    expect(escolhida?.option).toBe(MAIS_BARATA)
  })

  /**
   * ⚠️ Caso extremo da spec: pedágio desconhecido é `totalCost` nulo, e **não concorre** a mais
   * barata. Elegê-la seria gravar a rota cujo custo ninguém sabe tendo outra com custo medido ao
   * lado — a direção que faz aceitar carga que não paga.
   */
  it('não elege como mais barata a opção cujo pedágio é desconhecido', () => {
    const semPedagioConhecido = optionOf({ signature: 'dddd', tollTotal: null, totalCost: null })
    const escolhida = selectRouteOption({
      choice: { criterion: 'cheapest', signature: null },
      options: [semPedagioConhecido, MAIS_BARATA],
    })

    expect(escolhida?.option).toBe(MAIS_BARATA)
    expect(escolhida?.reproduced).toBe(true)
  })

  /** D1: sem custo comparável nenhum, abre na principal — e diz por quê. */
  it('sem candidata alguma fica na principal e marca não reproduzida', () => {
    const semCusto = [
      optionOf({ signature: 'dddd', tollTotal: null, totalCost: null }),
      optionOf({ signature: 'eeee', tollTotal: null, totalCost: null }),
    ]
    const escolhida = selectRouteOption({
      choice: { criterion: 'cheapest', signature: null },
      options: semCusto,
    })

    expect(escolhida?.option).toBe(semCusto[0])
    expect(escolhida?.reproduced).toBe(false)
  })

  it('sem rota sem pedágio entre as ofertas fica na principal e marca não reproduzida', () => {
    const escolhida = selectRouteOption({
      choice: { criterion: 'no_toll', signature: null },
      options: [PRINCIPAL, MAIS_BARATA],
    })

    expect(escolhida?.option).toBe(PRINCIPAL)
    expect(escolhida?.reproduced).toBe(false)
  })

  it('uma oferta só é a escolhida, qualquer que seja o critério', () => {
    for (const criterion of ['cheapest', 'fastest', 'no_toll', 'alternative'] as const) {
      const escolhida = selectRouteOption({
        choice: { criterion, signature: null },
        options: [PRINCIPAL],
      })

      expect(escolhida?.option).toBe(PRINCIPAL)
    }
  })

  /** Sem oferta nenhuma não há rota a afirmar — e `options[0]` não existe para ser devolvido. */
  it('sem oferta nenhuma não devolve escolha', () => {
    for (const criterion of ['cheapest', 'fastest', 'no_toll', 'alternative'] as const) {
      const choice = { criterion, signature: null } satisfies {
        criterion: RouteChoiceCriterion
        signature: null | string
      }

      expect(selectRouteOption({ choice, options: [] })).toBeNull()
    }
  })

  /** Comparar `totalCost` como texto poria `'9.00'` depois de `'10.00'` — é dinheiro, não string. */
  it('compara custo como número decimal, não como texto', () => {
    const nove = optionOf({ signature: 'ffff', totalCost: '9.00' })
    const dez = optionOf({ signature: 'gggg', totalCost: '10.00' })
    const escolhida = selectRouteOption({
      choice: { criterion: 'cheapest', signature: null },
      options: [dez, nove],
    })

    expect(escolhida?.option).toBe(nove)
  })
})
