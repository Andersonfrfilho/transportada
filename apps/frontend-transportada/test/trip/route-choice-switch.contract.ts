/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T402: o switch explícito entre a rota mais rápida e a mais barata (RF13), sobre as
 * opções que a montagem já tem em mãos — sem ida nova ao OSRM. No molde de
 * `test/trip/assembly-route-options.contract.ts`: contrato do cálculo puro primeiro, depois o
 * contrato de tela por texto de fonte (mesmo molde de `assembly-route-selector.contract.ts`).
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it, test } from 'bun:test'
import { QueryClient, QueryObserver } from '@tanstack/react-query'

import { createTripAssemblyRouteGeometryQueryOptions } from '../../src/modules/trip/components/TripAssemblyMap.component'
import {
  buildRouteChoiceSignatureKey,
  resolveRouteChoiceEmission,
  resolveRouteChoiceFromIndex,
  type RouteGeometryForEmission,
} from '../../src/modules/trip/shared/assemblyRouteOptions.service'
import type {
  RouteChoice,
  RouteGeometry,
  RouteGeometryOption,
} from '../../src/modules/trip/shared/routeGeometry.service'
import type { TripClient } from '../../src/modules/trip/shared/tripClient.service'

const ASSEMBLY_MAP = new URL(
  '../../src/modules/trip/components/TripAssemblyMap.component.tsx',
  import.meta.url,
)
const ROUTE_CHOICE_OPTIONS = new URL(
  '../../src/modules/trip/components/RouteChoiceOptions.component.tsx',
  import.meta.url,
)
const ROUTE_TOLL_SUMMARY = new URL(
  '../../src/modules/trip/components/RouteTollSummary.component.tsx',
  import.meta.url,
)

function opcao(input: {
  readonly isNoToll?: boolean
  readonly signature?: null | string
}): RouteGeometryOption {
  return {
    distanceMeters: 100_000,
    durationSeconds: 3_600,
    fuelTotal: null,
    isNoToll: input.isNoToll ?? false,
    legs: [],
    points: [],
    signature: input.signature ?? null,
    toll: null,
    totalCost: null,
  }
}

describe('resolveRouteChoiceFromIndex (spec 153 T402 / D2)', () => {
  const OPTIONS: readonly RouteGeometryOption[] = [
    opcao({ signature: 'aaaa' }),
    opcao({ isNoToll: true, signature: 'bbbb' }),
    opcao({ signature: 'cccc' }),
  ]

  it('identifica a rota mais barata pelo índice, nunca por posição arbitrária', () => {
    const escolha = resolveRouteChoiceFromIndex({
      cheapestIndex: 0,
      fastestIndex: 2,
      index: 0,
      options: OPTIONS,
    })

    expect(escolha).toEqual({ criterion: 'cheapest', signature: 'aaaa' })
  })

  it('identifica a rota mais rápida pelo índice', () => {
    const escolha = resolveRouteChoiceFromIndex({
      cheapestIndex: 0,
      fastestIndex: 2,
      index: 2,
      options: OPTIONS,
    })

    expect(escolha).toEqual({ criterion: 'fastest', signature: 'cccc' })
  })

  it('identifica a opção sem pedágio quando ela não é a mais rápida nem a mais barata', () => {
    const escolha = resolveRouteChoiceFromIndex({
      cheapestIndex: 0,
      fastestIndex: 2,
      index: 1,
      options: OPTIONS,
    })

    expect(escolha).toEqual({ criterion: 'no_toll', signature: 'bbbb' })
  })

  /** Sem pedágio e mais barata ao mesmo tempo: a razão da escolha é o custo, não a ausência de praça. */
  it('prioriza mais barata/mais rápida sobre sem pedágio quando as duas coincidem', () => {
    const comSemPedagioBarata: readonly RouteGeometryOption[] = [
      opcao({ isNoToll: true, signature: 'zzzz' }),
    ]

    const escolha = resolveRouteChoiceFromIndex({
      cheapestIndex: 0,
      fastestIndex: null,
      index: 0,
      options: comSemPedagioBarata,
    })

    expect(escolha.criterion).toBe('cheapest')
  })

  it('cai em alternative quando a opção não é a mais rápida, a mais barata, nem sem pedágio', () => {
    const escolha = resolveRouteChoiceFromIndex({
      cheapestIndex: 0,
      fastestIndex: 2,
      index: 1,
      options: [opcao({ signature: 'a' }), opcao({ signature: 'b' }), opcao({ signature: 'c' })],
    })

    expect(escolha).toEqual({ criterion: 'alternative', signature: 'b' })
  })

  it('a assinatura é null quando a opção não a trouxe, nunca inventada', () => {
    const escolha = resolveRouteChoiceFromIndex({
      cheapestIndex: 0,
      fastestIndex: null,
      index: 0,
      options: [opcao({ signature: null })],
    })

    expect(escolha.signature).toBeNull()
  })
})

describe('TripAssemblyMap: switch mais rápida ↔ mais barata sem novo OSRM (spec 153 T402/RF13)', () => {
  const source = readFileSync(ASSEMBLY_MAP, 'utf8')

  /**
   * ⚠️ Só pode existir **uma** chamada ao roteirizador nesta tela — trocar de critério não é
   * motivo para ida nova ao OSRM (RF13). Duas ocorrências da *chamada* (não do nome do método, que
   * também aparece no tipo de `createTripAssemblyRouteGeometryQueryOptions`) provariam um segundo
   * fetch.
   */
  it('chama a geometria uma única vez — trocar de critério não refaz a chamada', () => {
    const chamadas = source.split('.readPointsRouteGeometry(').length - 1
    expect(chamadas).toBe(1)
  })

  /**
   * A chave da consulta não pode depender do índice/critério escolhido — senão trocar mudaria a
   * `queryKey` e o TanStack Query disparia a busca de novo.
   */
  it('a chave da consulta de geometria não inclui o índice/critério escolhido', () => {
    const queryKeyBlock = source.slice(
      source.indexOf('queryKey: '),
      source.indexOf('queryKey: ') + 200,
    )
    expect(queryKeyBlock).not.toInclude('selectedOptionIndex')
    expect(queryKeyBlock).not.toInclude('routeChoiceCriterion')
  })

  /**
   * D1: a tela abre na mais barata — o `selectedIndex` que a API já resolveu, nunca `0` fixo.
   * `setSelectedOptionIndex(0)` só é legítimo no ramo sem resposta nenhuma ainda (ver o teste de
   * `resolveRouteChoiceEmission` acima, que prova o `0` correto quando a API não manda o índice).
   */
  it('abre a escolha na rota que a API já resolveu como mais barata', () => {
    expect(source).toInclude('resolveRouteChoiceEmission')
    expect(source).toInclude('emission.selectedIndex')
  })

  it('monta o switch abaixo do bloco de pedágio, e propaga canReadFinancials', () => {
    const tollIndex = source.indexOf('<RouteTollSummary')
    const switchIndex = source.indexOf('<RouteChoiceOptions')

    expect(tollIndex).toBeGreaterThan(-1)
    expect(switchIndex).toBeGreaterThan(tollIndex)
    expect(source).toInclude('canReadFinancials={canReadFinancials}')
  })

  /** Trocar regrava a escolha (RF13): o callback de saída dispara a cada troca. */
  it('a troca de opção sai do componente por onRouteChoiceChange, nunca por índice cru', () => {
    expect(source).toInclude('onRouteChoiceChange?.(')
    expect(source).toInclude('resolveRouteChoiceFromIndex')
  })

  /**
   * spec 153 H1/M7: sem emitir a escolha inicial, o pai (criação manual, proposta) nunca ouve
   * falar da rota que a API abriu, e sempre manda o default `cheapest`/`signature: null` — mesmo
   * quando ninguém tocou o seletor. A emissão precisa acontecer em **dois** pontos: o clique
   * manual (`handleSelectRouteOptionIndex`, via `onRouteChoiceChange?.(`) e o efeito que reage à
   * resposta da consulta — a mesma chamada que já mexe em `selectedOptionIndex`.
   *
   * T905 (P12): o efeito passou a ler o callback por `onRouteChoiceChangeRef.current?.(` (não
   * `onRouteChoiceChange?.(` direto) para satisfazer `react-hooks/exhaustive-deps` sem reemitir a
   * escolha a cada render do pai — mesmo motivo de `geometryDataRef` já existente neste arquivo.
   * A prova conta os dois padrões, não mais um único literal.
   */
  it('emite a escolha assim que a resposta chega, não só no clique do seletor', () => {
    const directCallCount = source.split('onRouteChoiceChange?.(').length - 1
    const refCallCount = source.split('onRouteChoiceChangeRef.current?.(').length - 1
    expect(directCallCount + refCallCount).toBe(2)
  })

  /**
   * ⚠️ Segunda revisão da spec 153, N4/N11: a versão anterior desta prova comparava o texto do
   * array de dependências do efeito por igualdade literal (`}, [routeKey, tollVehicleId,
   * geometryQuery.data])`) — passava mesmo com o índice de reset errado, e quebrava com qualquer
   * reformatação inofensiva. O comportamento de verdade — o efeito não pode reemitir a escolha só
   * porque o TanStack Query devolveu um objeto novo com o **mesmo conteúdo** — está provado por
   * comportamento em `test/trip/assembly-route-options.contract.ts`
   * (`buildRouteChoiceSignatureKey`: duas respostas com referências diferentes e conteúdo igual
   * produzem a mesma chave) e aqui embaixo, sobre a consulta real via `QueryObserver`.
   */
  it('a montagem não referencia mais geometryQuery.data como dependência bruta do efeito', () => {
    expect(source).toInclude('buildRouteChoiceSignatureKey')
    expect(source).toInclude('geometryDataRef.current = geometryQuery.data')
    expect(source).not.toInclude('[routeKey, tollVehicleId, geometryQuery.data]')
  })
})

/**
 * Segunda revisão da spec 153, N4/N11: comportamento real sobre a consulta que `TripAssemblyMap`
 * usa — `createTripAssemblyRouteGeometryQueryOptions`, extraída para o teste poder abrir um
 * `QueryObserver` de verdade, no molde de `test/trip/route-choice-detail.contract.ts`
 * (T706) e `test/identity/user-picture.contract.ts`. Nenhuma leitura de fonte: quem decide se o
 * `queryFn` dispara é o próprio `QueryObserver`, como no navegador.
 */
describe('TripAssemblyMap: consulta de geometria via QueryObserver real (spec 153, segunda revisão N4/N11)', () => {
  const POINTS = [
    { latitude: -23.55, longitude: -46.63 },
    { latitude: -22.9, longitude: -43.2 },
  ] as const

  function respostaComOpcoes(): RouteGeometry {
    return {
      cheapestIndex: 1,
      costGap: null,
      fastestIndex: 0,
      legs: [],
      options: [opcao({ signature: 'rota-mais-rapida' }), opcao({ signature: 'rota-mais-barata' })],
      points: [],
      selectedIndex: 1,
      source: 'road',
      toll: null,
    }
  }

  /** Busca uma única vez sobre a consulta real — o mesmo comportamento que T402 já exige em tela. */
  test('busca a geometria uma única vez através do QueryObserver', async () => {
    let requests = 0
    const client = {
      readPointsRouteGeometry: () => {
        requests += 1
        return Promise.resolve(respostaComOpcoes())
      },
    } as unknown as TripClient
    const queryClient = new QueryClient()
    const observer = new QueryObserver<RouteGeometry>(
      queryClient,
      createTripAssemblyRouteGeometryQueryOptions({
        client,
        enabled: true,
        points: POINTS,
        routeKey: POINTS.map((point) => `${point.latitude},${point.longitude}`).join(';'),
        vehicleId: null,
      }),
    )
    const unsubscribe = observer.subscribe(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 10))
    unsubscribe()

    expect(requests).toBe(1)
    expect(observer.getCurrentResult().data?.selectedIndex).toBe(1)
  })

  /**
   * ⚠️ **O experimento vermelho do achado N4.** Duas respostas da mesma consulta (simulando um
   * refetch de foco depois do `staleTime` vencer) chegam como objetos **diferentes** — é assim que
   * o TanStack Query sempre se comportou, e é exatamente essa diferença de referência que o efeito
   * antigo usava como dependência. Quando o conteúdo é o mesmo, `buildRouteChoiceSignatureKey`
   * produz a mesma chave para as duas respostas, mesmo vindas de fetches separados de verdade — a
   * prova de que o efeito corrigido não teria motivo para reemitir a escolha entre elas. Revertendo
   * `buildRouteChoiceSignatureKey` para devolver a própria referência (`data`) faz este teste
   * falhar, porque `data !== data` nunca é verdade e as duas "chaves" (os dois objetos) deixam de
   * ser iguais por `toBe`.
   */
  test('duas buscas reais com o mesmo conteúdo produzem referências diferentes, mas a mesma chave de escolha', async () => {
    let requests = 0
    const client = {
      readPointsRouteGeometry: () => {
        requests += 1
        return Promise.resolve(respostaComOpcoes())
      },
    } as unknown as TripClient
    const queryOptions = createTripAssemblyRouteGeometryQueryOptions({
      client,
      enabled: true,
      points: POINTS,
      routeKey: POINTS.map((point) => `${point.latitude},${point.longitude}`).join(';'),
      vehicleId: null,
    })

    const first = await queryOptions.queryFn()
    const second = await queryOptions.queryFn()

    expect(requests).toBe(2)
    expect(first).not.toBe(second)
    expect(buildRouteChoiceSignatureKey(first)).toBe(buildRouteChoiceSignatureKey(second))
    expect(resolveRouteChoiceEmission(first)).toEqual(resolveRouteChoiceEmission(second))
  })
})

/**
 * Terceira revisão, T904 (P5): a suíte acima prova que duas buscas reais produzem a mesma
 * `buildRouteChoiceSignatureKey` — mas não que o *efeito* do componente, que lê essa chave no
 * array de dependências do `useEffect` para decidir se chama `onRouteChoiceChange` de novo e se
 * `selectedOptionIndex` volta ao valor resolvido da resposta, respeita isso. É exatamente esse
 * efeito que o achado N4 quebrou (RF13 ao contrário): reemitir e perder a escolha do operador.
 *
 * ⚠️ **Por que não `render(<TripAssemblyMap />)`:** esta base não tem `jsdom`/`happy-dom` nem
 * `@testing-library/react` — nem em `package.json` (`grep -i jsdom\|testing-library`), nem
 * instalados em `node_modules` (conferido nesta task) —, e a ausência é decisão estrutural já
 * documentada em dois contratos deste repositório: `test/design-system/box-dimension-scanner.
 * contract.ts` ("Sem renderer/jsdom nesta base, a garantia é estrutural") e `test/design-system/
 * camera-stream.contract.ts`. `TripAssemblyMap` soma ainda outra barreira: carrega o MapLibre por
 * `lazy()` (`AssemblyVectorMap`), então montá-lo de verdade também puxaria o mapa vetorial. E
 * mesmo com DOM, `useEffect` só roda no commit de um renderer real — SSR (`react-dom/server`)
 * não o executa, então nem uma renderização para string proyaria o comportamento. Instalar
 * `jsdom`/`testing-library` só para esta task é decisão de dependência nova fora do escopo de
 * P4/P5 (pede justificativa própria, `code-standart.md` §13) — reportado aqui em vez de
 * decidido sozinho.
 *
 * O mais perto de "renderizar e observar o efeito" sem essas peças: uma máquina de estados que
 * roda as MESMAS duas transições que o componente roda — a chegada da geometria (o `useEffect`,
 * com a MESMA regra de disparo do React: o corpo só reexecuta quando algum item do array de
 * dependências muda por `Object.is`, contrato documentado do hook, não lógica de aplicação) e a
 * escolha manual (`handleSelectRouteOptionIndex`) — usando as MESMAS funções de produção que o
 * componente importa (`resolveRouteChoiceFromIndex`, `resolveRouteChoiceEmission`,
 * `buildRouteChoiceSignatureKey`) sobre respostas reais do `queryFn` acima, não fixture estática.
 * Só a renderização é simulada; o dado e o cálculo são os de produção.
 */
describe('TripAssemblyMap: o efeito de emissão sobrevive a um refetch idêntico sem perder a escolha do operador (spec 153 T904/N4/RF13)', () => {
  type EffectDependencies = readonly [string, null | string, null | string]

  function dependenciesChanged(
    previous: EffectDependencies | undefined,
    next: EffectDependencies,
  ): boolean {
    return previous === undefined || next.some((value, index) => !Object.is(value, previous[index]))
  }

  /**
   * Reproduz literalmente as duas únicas formas pelas quais `TripAssemblyMap` chama
   * `onRouteChoiceChange` (spec 153 H1/M7/RF13): o efeito que reage à resposta da consulta, com
   * a MESMA chave de dependências `[routeKey, tollVehicleId, routeSignatureKey]` do componente
   * real (`TripAssemblyMap.component.tsx`), e `handleSelectRouteOptionIndex`, chamado pelo clique
   * no seletor.
   */
  function createRouteChoiceEffectHarness(): Readonly<{
    emissions: RouteChoice[]
    receiveGeometry: (input: {
      readonly data: RouteGeometryForEmission | undefined
      readonly routeKey: string
      readonly tollVehicleId: null | string
    }) => void
    selectOption: (input: {
      readonly cheapestIndex: null | number
      readonly fastestIndex: null | number
      readonly index: number
      readonly options: readonly RouteGeometryOption[]
    }) => void
    selectedOptionIndex: () => number
  }> {
    let selectedOptionIndex = 0
    let previousDependencies: EffectDependencies | undefined
    const emissions: RouteChoice[] = []

    return {
      emissions,
      receiveGeometry(input) {
        const routeSignatureKey = buildRouteChoiceSignatureKey(input.data)
        const dependencies: EffectDependencies = [
          input.routeKey,
          input.tollVehicleId,
          routeSignatureKey,
        ]
        if (!dependenciesChanged(previousDependencies, dependencies)) return
        previousDependencies = dependencies

        if (input.data === undefined) {
          selectedOptionIndex = 0
          return
        }
        const emission = resolveRouteChoiceEmission(input.data)
        selectedOptionIndex = emission.selectedIndex
        emissions.push(emission.routeChoice)
      },
      selectOption(input) {
        selectedOptionIndex = input.index
        emissions.push(
          resolveRouteChoiceFromIndex({
            cheapestIndex: input.cheapestIndex,
            fastestIndex: input.fastestIndex,
            index: input.index,
            options: input.options,
          }),
        )
      },
      selectedOptionIndex: () => selectedOptionIndex,
    }
  }

  const POINTS = [
    { latitude: -23.55, longitude: -46.63 },
    { latitude: -22.9, longitude: -43.2 },
  ] as const
  const ROUTE_KEY = POINTS.map((point) => `${point.latitude},${point.longitude}`).join(';')

  function respostaComOpcoes(): RouteGeometry {
    return {
      cheapestIndex: 1,
      costGap: null,
      fastestIndex: 0,
      legs: [],
      options: [
        {
          distanceMeters: 100_000,
          durationSeconds: 3_600,
          fuelTotal: null,
          isNoToll: false,
          legs: [],
          points: [],
          signature: 'rota-mais-rapida',
          toll: null,
          totalCost: null,
        },
        {
          distanceMeters: 120_000,
          durationSeconds: 4_200,
          fuelTotal: null,
          isNoToll: false,
          legs: [],
          points: [],
          signature: 'rota-mais-barata',
          toll: null,
          totalCost: null,
        },
      ],
      points: [],
      selectedIndex: 1,
      source: 'road',
      toll: null,
    }
  }

  /**
   * A prova pedida em T904: busca real → abre na mais barata (D1) → operador escolhe a opção 2
   * (índice 0, a mais rápida) → refetch real com o MESMO conteúdo (outro objeto, RF13) → a escolha
   * do operador nem foi reemitida (a chave de conteúdo não mudou) nem foi perdida.
   */
  test('escolher a opção 2 e refazer a busca com o mesmo conteúdo não reemite nem perde a escolha', async () => {
    let requests = 0
    const client = {
      readPointsRouteGeometry: () => {
        requests += 1
        return Promise.resolve(respostaComOpcoes())
      },
    } as unknown as TripClient
    const queryOptions = createTripAssemblyRouteGeometryQueryOptions({
      client,
      enabled: true,
      points: POINTS,
      routeKey: ROUTE_KEY,
      vehicleId: null,
    })
    const harness = createRouteChoiceEffectHarness()

    const first = await queryOptions.queryFn()
    harness.receiveGeometry({ data: first, routeKey: ROUTE_KEY, tollVehicleId: null })

    expect(harness.selectedOptionIndex()).toBe(1)
    expect(harness.emissions).toEqual([{ criterion: 'cheapest', signature: 'rota-mais-barata' }])

    harness.selectOption({
      cheapestIndex: first.cheapestIndex ?? null,
      fastestIndex: first.fastestIndex ?? null,
      index: 0,
      options: first.options ?? [],
    })

    expect(harness.selectedOptionIndex()).toBe(0)
    expect(harness.emissions).toHaveLength(2)
    expect(harness.emissions[1]).toEqual({ criterion: 'fastest', signature: 'rota-mais-rapida' })

    const second = await queryOptions.queryFn()
    expect(second).not.toBe(first)
    harness.receiveGeometry({ data: second, routeKey: ROUTE_KEY, tollVehicleId: null })

    expect(requests).toBe(2)
    /** ⚠️ Sem esta linha o experimento vermelho (documentado em evidence.md) não pega o N4 de volta. */
    expect(harness.emissions).toHaveLength(2)
    expect(harness.selectedOptionIndex()).toBe(0)
  })
})

describe('RouteChoiceOptions: seletor com "Sem pedágio" e switch (spec 153 T402)', () => {
  const source = readFileSync(ROUTE_CHOICE_OPTIONS, 'utf8')

  it('rotula a opção sem pedágio calculado', () => {
    expect(source).toInclude('isNoToll')
    expect(source).toInclude('routeOptions.noToll')
  })

  it('o switch usa o primitivo de abas do design system, não um controle cru', () => {
    expect(source).toInclude("from '@/components/ui/tabs'")
  })

  /** RF13: opção única (ou empate mais rápida/mais barata) avisa em tela — nunca switch inerte. */
  it('sem alternativa real entre mais rápida e mais barata, avisa em vez de montar o switch', () => {
    expect(source).toInclude('routeOptions.singleOption')
    const semAlternativaIndex = source.indexOf('routeOptions.singleOption')
    const tabsIndex = source.indexOf('<Tabs')
    expect(semAlternativaIndex).toBeGreaterThan(-1)
    expect(tabsIndex).toBeGreaterThan(-1)
  })

  /** D10: sem `trip.financials` o total some da tela, nunca vira zero. */
  it('o total só imprime com canReadFinancials — nunca condicionado só ao dado', () => {
    const totalBlock = source.slice(
      source.indexOf("t('assemblyMap.routeOptions.total'"),
      source.indexOf("t('assemblyMap.routeOptions.total'") + 1,
    )
    expect(totalBlock).not.toBe('')
    expect(source).toInclude('canReadFinancials &&')
  })
})

describe('RouteTollSummary: canReadFinancials some com o dinheiro, nunca com o resto (spec 153 D10)', () => {
  const source = readFileSync(ROUTE_TOLL_SUMMARY, 'utf8')

  it('recebe canReadFinancials como prop', () => {
    expect(source).toInclude('canReadFinancials: boolean')
  })

  it('o resumo com valor e o extrato por praça são guardados por canReadFinancials', () => {
    const summaryGuardIndex = source.indexOf('!canReadFinancials')
    expect(summaryGuardIndex).toBeGreaterThan(-1)
  })

  /** Praças, forma de pagamento e catálogo não são dinheiro — continuam fora da trava. */
  it('a lista de praças e a forma de pagamento continuam fora da trava de canReadFinancials', () => {
    const paymentModeIndex = source.indexOf('toll.paymentMode}`')
    const boothListIndex = source.indexOf('toll.booths.map')
    expect(paymentModeIndex).toBeGreaterThan(-1)
    expect(boothListIndex).toBeGreaterThan(-1)
  })
})
