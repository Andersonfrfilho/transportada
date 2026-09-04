/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  TripValuation,
  TripValuationCostParcel,
} from '@/modules/trip-financials/shared/tripValuation.service'

/**
 * ADR-0049 §4: **imposto não é custo de operação** — ele desce da receita, e a tela separa os dois.
 * Somá-los numa coluna só faria a margem parecer pior por motivo errado, e esconderia que uma parte
 * do que sai é tributo sobre o frete, não gasto de rodar.
 */
const TAX_KINDS: readonly string[] = ['icms', 'pis_cofins']

export type ValuationStepGroup = Readonly<{
  parcels: readonly TripValuationCostParcel[]
  total: string
}>

export type ValuationSteps = Readonly<{
  operating: ValuationStepGroup
  taxes: ValuationStepGroup
}>

/**
 * Soma em centavos inteiros: `Number` sobre decimal de dinheiro acumula erro binário, e a soma das
 * parcelas tem de bater com o total que a API já mandou — divergir por um centavo na tela é pior do
 * que não mostrar o detalhe.
 */
function sumAmounts(parcels: readonly TripValuationCostParcel[]): string {
  const total = parcels.reduce((accumulated, parcel) => accumulated + toCents(parcel.amount), 0n)
  const negative = total < 0n
  const absolute = negative ? -total : total
  const cents = (absolute % 100n).toString().padStart(2, '0')
  return `${negative ? '-' : ''}${(absolute / 100n).toString()}.${cents}`
}

function toCents(amount: string): bigint {
  const [whole = '0', fraction = ''] = amount.trim().split('.')
  const cents = `${fraction}00`.slice(0, 2)
  const magnitude = BigInt(`${whole.replace('-', '')}${cents}`)
  return whole.startsWith('-') ? -magnitude : magnitude
}

/**
 * Os passos da conta: o que a operação custa, e o que o imposto leva. A parcela com lacuna **fica na
 * lista** com o motivo ao lado — tirá-la faria a soma parecer completa, que é o defeito que a
 * política inteira existe para evitar.
 */
export function buildValuationSteps(valuation: TripValuation): ValuationSteps {
  const operating = valuation.costParcels.filter((parcel) => !TAX_KINDS.includes(parcel.kind))
  const taxes = valuation.costParcels.filter((parcel) => TAX_KINDS.includes(parcel.kind))

  return {
    operating: { parcels: operating, total: sumAmounts(operating) },
    taxes: { parcels: taxes, total: sumAmounts(taxes) },
  }
}
