/* Copyright (c) 2026 Ada Technology. MIT License. */
import { compareScaledAmounts, sumScaledAmounts } from '@/modules/shared/decimalAmount.service'

import type {
  TripValuation,
  TripValuationCostParcel,
  TripValuationCostParcelBasis,
} from './tripValuation.service'

/**
 * Spec 110 D7: **a conta numa coluna, e cada custo com a derivação na linha de baixo.**
 *
 * A primeira versão desta tela tinha o mesmo número em três lugares — o topo, a lista de parcelas e
 * um painel lateral com a derivação. Três lugares é onde eles começam a discordar, e foi o próprio
 * usuário que apontou: uma coluna só, pulando a linha.
 *
 * ⚠️ **Serviço puro, e é ele que a criação manual e a proposta compartilham.** Duas implementações
 * da mesma conta divergem caladas — foi assim que o preço do combustível passou a ler só o ajuste
 * manual enquanto a ficha do veículo lia o efetivo (spec 100).
 */

/**
 * ADR-0049 §4: **imposto não é custo de operação** — ele desce da receita. Somá-los numa coluna só
 * faria a margem parecer pior por motivo errado, e esconderia que parte do que sai é tributo sobre o
 * frete, não gasto de rodar.
 */
const TAX_KINDS: readonly string[] = ['icms', 'pis_cofins']

/**
 * Spec 122: **o risco segue a LACUNA, nunca a parcela.** `delivery_charges` cai em `FEATURE_ABSENT`
 * hoje porque o módulo de taxas de entrega ainda não foi construído — o usuário pediu risco em vez
 * do rótulo neutro "módulo ainda não usado", que soava como cadastro esquecido em vez de recurso
 * inexistente. Se `FEATURE_ABSENT` um dia nomear outra parcela ainda não construída, ela herda o
 * mesmo risco sem precisar de código novo; nenhuma outra lacuna muda de aparência.
 */
export const STRUCK_THROUGH_GAPS: readonly string[] = ['FEATURE_ABSENT']

/**
 * Spec 124: **aviso, não lacuna** — cópia por valor de `ADVISORY_GAPS` da API, conferida contra o
 * fonte por `test/trip-financials/valuation-ledger-advisory.contract.ts`. A linha tem valor que conta
 * no total; esconder o número seria a tela somar o que não imprime.
 */
export const ADVISORY_GAPS: readonly string[] = [
  'DRIVER_ZONE_PRICED_FROM_TABLE',
  'DRIVER_ROUTE_TIE_HIGHEST_RATE',
]

/**
 * O **remédio** da lacuna, não a tela onde ele se resolve. `ValuationLedger` é o mesmo
 * componente na viagem, na prévia e na proposta — amarrar a lacuna a uma tela quebraria a proposta,
 * que não tem (e não deve ter) as ações de viagem. Quem monta a tela decide, por `gapActions`, se o
 * remédio existe ali; o serviço só nomeia qual remédio é o certo para cada lacuna.
 */
export const GapRemedy = {
  EMISSION_PROFILE: 'emissionProfile',
  FEDERAL_REGIME: 'federalRegime',
  PLAN_ROUTE: 'planRoute',
  RECORD_COST: 'recordCost',
} as const
export type GapRemedy = (typeof GapRemedy)[keyof typeof GapRemedy]

/** Lacuna fora deste mapa não tem remédio — o motivo continua texto puro. */
export const GAP_REMEDY: Readonly<Record<string, GapRemedy>> = {
  NO_EMISSION_PROFILE: GapRemedy.EMISSION_PROFILE,
  NO_FEDERAL_REGIME: GapRemedy.FEDERAL_REGIME,
  NO_PLANNED_DISTANCE: GapRemedy.PLAN_ROUTE,
  NO_PLANNED_DURATION: GapRemedy.PLAN_ROUTE,
  NOT_RECORDED: GapRemedy.RECORD_COST,
}

export type ValuationLedgerLine = Readonly<{
  /**
   * `null` **quando há lacuna**: ali o motivo ocupa o lugar do número, e zero seria mentira. A
   * exceção é o aviso (spec 124), cujo número conta no total e fica visível ao lado do motivo.
   */
  amount: null | string
  basis: null | TripValuationCostParcelBasis
  detail: null | string
  gap: null | string
  /** Spec 124: a lacuna é aviso — o valor aparece, e o motivo vem logo abaixo dele. */
  isAdvisory: boolean
  /** Projeção, não apuração: a tela imprime a marca de estimado ao lado do número. */
  isEstimated: boolean
  /** Spec 122: `true` só quando `gap` está em `STRUCK_THROUGH_GAPS` — a tela risca a linha. */
  isGapStruckThrough: boolean
  kind: string
  /** `null` sem lacuna acionável — aviso não pede ação, o número já está lá. */
  remedy: null | GapRemedy
}>

export type ValuationLedger = Readonly<{
  hasGaps: boolean
  marginPercentage: null | string
  operating: readonly ValuationLedgerLine[]
  /** A soma das linhas conhecidas, para a tela poder conferir o total contra as parcelas. */
  sum: string
  taxes: readonly ValuationLedgerLine[]
  totalCost: string
  totalMargin: string
  totalRevenue: string
}>

function toLine(parcel: TripValuationCostParcel): ValuationLedgerLine {
  const isAdvisory = parcel.gap !== null && ADVISORY_GAPS.includes(parcel.gap)
  const showsAmount = parcel.gap === null || isAdvisory

  return {
    amount: showsAmount ? parcel.amount : null,
    basis: parcel.basis,
    detail: parcel.detail,
    gap: parcel.gap,
    isAdvisory,
    isEstimated: showsAmount && parcel.source === 'estimated',
    isGapStruckThrough: parcel.gap !== null && STRUCK_THROUGH_GAPS.includes(parcel.gap),
    kind: parcel.kind,
    remedy: parcel.gap === null || isAdvisory ? null : (GAP_REMEDY[parcel.gap] ?? null),
  }
}

/**
 * Maior primeiro, e a lacuna por último.
 *
 * ⚠️ O agregado costuma ser o **dobro** do combustível: na ordem que a API devolve ele cai no meio
 * da lista, e é por ele que a viagem se decide. A lacuna fecha o grupo porque ela não tem tamanho
 * para comparar — o olho encontra primeiro os custos que existem, e depois o que falta cadastrar.
 */
function byWeight(first: ValuationLedgerLine, second: ValuationLedgerLine): number {
  if (first.amount === null && second.amount === null) return 0
  if (first.amount === null) return 1
  if (second.amount === null) return -1

  /**
   * ⚠️ `compareScaledAmounts`, não comparação de string: `'9.0000'` viria antes de `'43.1316'`, e a
   * lista sairia ordenada por texto — que é a ordem errada com a cara de certa.
   */
  return compareScaledAmounts(second.amount, first.amount)
}

export function buildValuationLedger(valuation: null | TripValuation): null | ValuationLedger {
  if (valuation === null) return null

  const lines = valuation.costParcels.map(toLine)
  const operating = lines.filter((line) => !TAX_KINDS.includes(line.kind)).sort(byWeight)
  const taxes = lines.filter((line) => TAX_KINDS.includes(line.kind)).sort(byWeight)
  const sum = sumScaledAmounts(
    [...operating, ...taxes].flatMap((line) => (line.amount === null ? [] : [line.amount])),
  )

  return {
    hasGaps: valuation.hasGaps,
    marginPercentage: valuation.marginPercentage,
    operating,
    sum,
    taxes,
    totalCost: valuation.totalCost,
    totalMargin: valuation.totalMargin,
    totalRevenue: valuation.totalRevenue,
  }
}
