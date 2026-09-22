/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 D1/D2/D3: qual rota o operador escolheu, e como reencontrá-la na chamada seguinte.
 *
 * ⚠️ **Índice não identifica rota.** Ele depende da ordem em que o OSRM devolveu as alternativas e
 * de quais delas foram descartadas por virem malformadas — ao gravar, a API pede as rotas de novo, e
 * o índice 1 de agora é outra estrada. A identidade é a sequência de nós OSM percorridos, resumida
 * numa assinatura.
 *
 * ⚠️ **A ordenação por custo não mora aqui.** `rankRouteOptions` (`toll-booths/domain`) é quem soma
 * combustível e pedágio e publica `totalCost`; esta política só escolhe entre opções **já
 * pontuadas** por ela — é o que `SelectableRouteOption` diz ao estender `RankedRouteOption`. Uma
 * segunda conta de custo aqui divergiria calada da que a tela rotula de "mais barata".
 */
import { createHash } from 'node:crypto'

import { MONEY_SCALE, parseScaledDecimal } from '../../shared/decimal.service.js'
import type { RankedRouteOption } from '../../toll-booths/domain/route-option.policy.js'

const ERROR_CODE_PREFIX = 'ROUTE_CHOICE'

/** Os 16 primeiros bytes do sha256 — sobra de folga para as poucas opções de uma rota. */
const SIGNATURE_HEX_LENGTH = 32

const LEG_SEPARATOR = ';'
const NODE_SEPARATOR = ','

export const ROUTE_CHOICE_CRITERIA = ['cheapest', 'fastest', 'no_toll', 'alternative'] as const
export type RouteChoiceCriterion = (typeof ROUTE_CHOICE_CRITERIA)[number]

export type RouteChoice = Readonly<{
  criterion: RouteChoiceCriterion
  /**
   * A rota que o operador viu na tela. `null` é **"quem pediu não tinha assinatura"** — corpo
   * ausente, recálculo automático da D6, ou rota sem anotação de nós —, nunca "a assinatura falhou".
   */
  signature: null | string
}>

/**
 * Uma opção pronta para ser escolhida: o que `rankRouteOptions` já pontuou, mais a identidade e a
 * marca de rota sem pedágio que a spec 153 acrescenta.
 */
export type SelectableRouteOption = RankedRouteOption &
  Readonly<{
    isNoToll: boolean
    signature: null | string
  }>

export type SelectedRouteOption<TOption extends SelectableRouteOption> = Readonly<{
  option: TOption
  /**
   * A rota devolvida é a que o pedido pediu. `false` é o aviso da D3, e cobre as duas formas de
   * falhar: a assinatura veio e não foi encontrada, ou o critério não achou candidata e a escolha
   * caiu na principal. Nos dois casos a tela precisa dizer que a rota mudou.
   *
   * ⚠️ Pedido **sem** assinatura que o critério atende é `true`: nada deixou de ser reproduzido, e
   * um aviso ali acusaria uma falha que não houve em toda viagem criada sem seletor.
   */
  reproduced: boolean
}>

/**
 * A identidade da estrada, para reencontrá-la quando a API pedir as rotas de novo.
 *
 * ⚠️ **Assina os nós por perna, não a lista achatada.** A lista achatada do gateway é deduplicada
 * atravessando o limite do trecho, então duas rotas que só diferem em onde a parada cai achatam para
 * a mesma sequência — assinatura igual para rotas diferentes é a colisão que a D2 não pode ter.
 *
 * ⚠️ Sem nó nenhum não há assinatura: um hash do vazio daria a **mesma** assinatura para toda rota
 * sem anotação, e a primeira delas passaria a ser "reproduzida" para sempre. Assinatura nula é
 * justamente o que faz a D3 cair no critério.
 */
export function buildRouteSignature(input: {
  readonly nodeIdsByLeg: null | readonly (readonly number[])[]
}): null | string {
  const { nodeIdsByLeg } = input
  if (nodeIdsByLeg === null) return null
  if (nodeIdsByLeg.every((leg) => leg.length === 0)) return null

  const canonical = nodeIdsByLeg.map((leg) => leg.join(NODE_SEPARATOR)).join(LEG_SEPARATOR)

  return createHash('sha256').update(canonical).digest('hex').slice(0, SIGNATURE_HEX_LENGTH)
}

/**
 * A rota escolhida entre as ofertas. `null` só quando não há oferta alguma — e aí não há rota a
 * afirmar.
 */
export function selectRouteOption<TOption extends SelectableRouteOption>(input: {
  readonly choice: RouteChoice
  readonly options: readonly TOption[]
}): null | SelectedRouteOption<TOption> {
  const { choice, options } = input
  const principal = options[0]
  if (principal === undefined) return null

  if (choice.signature !== null) {
    const signed = options.find((option) => option.signature === choice.signature)
    if (signed !== undefined) return { option: signed, reproduced: true }

    return { option: applyCriterion(choice.criterion, options) ?? principal, reproduced: false }
  }

  const candidate = applyCriterion(choice.criterion, options)
  if (candidate === undefined) return { option: principal, reproduced: false }

  return { option: candidate, reproduced: true }
}

/** `alternative` é "o operador trocou de rota sem dizer qual regra seguiu" — e aí vale a mais barata. */
function applyCriterion<TOption extends SelectableRouteOption>(
  criterion: RouteChoiceCriterion,
  options: readonly TOption[],
): TOption | undefined {
  if (criterion === 'fastest') {
    return bestOf(options, (option) => BigInt(Math.round(option.durationSeconds)))
  }
  if (criterion === 'no_toll') return options.find((option) => option.isNoToll)

  /**
   * ⚠️ Pedágio desconhecido é `totalCost` nulo e **não concorre**: eleger a rota cujo custo ninguém
   * sabe tendo outra medida ao lado é a direção que faz aceitar carga que não paga.
   */
  return bestOf(options, (option) => (option.totalCost === null ? null : money(option.totalCost)))
}

/** Peso `null` é "não concorre". Empate fica com a primeira: é a que o roteirizador tem por principal. */
function bestOf<TOption>(
  options: readonly TOption[],
  weightOf: (option: TOption) => bigint | null,
): TOption | undefined {
  let best: TOption | undefined
  let bestWeight = 0n

  for (const option of options) {
    const weight = weightOf(option)
    if (weight === null) continue
    if (best === undefined || weight < bestWeight) {
      best = option
      bestWeight = weight
    }
  }

  return best
}

/** Dinheiro se compara como decimal: em texto, `'9,00'` viria depois de `'10,00'`. */
function money(value: string): bigint {
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: MONEY_SCALE, value })
}
