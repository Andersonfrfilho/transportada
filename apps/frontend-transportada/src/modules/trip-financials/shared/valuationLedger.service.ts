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

export type ValuationLedgerLine = Readonly<{
  /** `null` **quando há lacuna**: ali o motivo ocupa o lugar do número, e zero seria mentira. */
  amount: null | string
  basis: null | TripValuationCostParcelBasis
  detail: null | string
  gap: null | string
  kind: string
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
  return {
    amount: parcel.gap === null ? parcel.amount : null,
    basis: parcel.basis,
    detail: parcel.detail,
    gap: parcel.gap,
    kind: parcel.kind,
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
