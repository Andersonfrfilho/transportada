/* Copyright (c) 2026 Ada Technology. MIT License. */
import { formatRateAmount } from '@/modules/shared/decimalAmount.service'

import type {
  DailyAllowanceRateOrigin,
  TripValuationCostParcelBasis,
} from './tripValuation.service'

/**
 * ⚠️ `TFunction` do react-i18next é sobrecarregado demais para caber num tipo simples sob
 * `exactOptionalPropertyTypes` — quem chama converte para este tipo na fronteira, uma vez, em vez
 * de este serviço puro conhecer a forma completa da biblioteca.
 */
export type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * Spec 143 — **a API manda a diária crua, uma linha por condutor, e a frase nasce aqui.** Mais de
 * um condutor soma a viagem (D2), e a frase soma junto: uma linha por condutor, na ordem de
 * `basis.crew`, separadas por `; `. O molde — valor × dias · origem — é o mesmo que
 * `freeze-trip-financial-result.use-case.ts` congela na viagem fechada; é ele quem fixa o contrato,
 * porque as duas nunca compartilham código (apps não importam fonte uma da outra).
 *
 * ⚠️ **Serviço puro, compartilhado entre o razão da viagem** (`ValuationLedger`) **e o da
 * proposta** (`SuggestionVehicleValuation`) — duas implementações da mesma frase divergiriam
 * caladas, como já aconteceu com o preço do combustível (spec 100).
 *
 * ⚠️ **Sem base do motorista cai no texto cru de `detail`.** É o caminho de um resultado congelado
 * antes desta spec, que guarda a frase (ou o código da lacuna) pronta, sem `basis` nenhum.
 */
export function composeCostParcelDetail(input: {
  readonly basis: null | TripValuationCostParcelBasis
  readonly detail: null | string
  readonly t: Translate
}): null | string {
  const { basis, detail, t } = input
  if (basis === null || basis.of !== 'driver') return detail

  return basis.crew
    .map((member) =>
      composeDriverAllowanceLine({
        dailyAmount: member.dailyAmount,
        days: basis.days,
        rateOrigin: member.rateOrigin,
        t,
      }),
    )
    .join(DRIVER_ALLOWANCE_SEPARATOR)
}

type ComposeDriverAllowanceLineInput = Readonly<{
  dailyAmount: string
  days: number
  rateOrigin: DailyAllowanceRateOrigin
  t: Translate
}>

function composeDriverAllowanceLine({
  dailyAmount,
  days,
  rateOrigin,
  t,
}: ComposeDriverAllowanceLineInput): string {
  return t('ledger.driverBasis', {
    amount: formatRateAmount(dailyAmount),
    count: days,
    days,
    origin: t(`ledger.driverRateOrigin.${rateOrigin}`),
  })
}

/** Entre condutores, nunca entre valor e origem: `·` já separa os dois dentro da linha. */
const DRIVER_ALLOWANCE_SEPARATOR = '; '
