/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.6 (RF19, RF20, CA11): o documento que o PDF e a planilha mostram. Os dois lêem **este** objeto, que sai do
 * mesmo cálculo da tela (`computeExpenseResult`): nenhuma soma é refeita aqui, só texto e formato (centavo a centavo).
 */
import type { AllocationCriterion, AllocationSettings } from './expense-allocation.policy.js'

export type ExpenseExportFormat = 'csv' | 'pdf'

export type ExpenseExportRow = {
  readonly cost: string
  readonly generalShare: string
  readonly label: string
  readonly margin: string
  readonly revenue: string
  readonly vehicleShare: string
  /** Só nas linhas por viagem. */
  readonly completedOn?: string
  readonly customer?: string
  readonly vehicle?: string
}

export type ExpenseExportDocument = {
  readonly byCustomer: readonly ExpenseExportRow[]
  readonly byTrip: readonly ExpenseExportRow[]
  readonly byVehicle: readonly ExpenseExportRow[]
  readonly calculatedAt: Date
  readonly companyName: string
  /** Texto de cada filtro aplicado (`Veículo: ABC1D23`); vazio quando não há filtro. */
  readonly filters: readonly string[]
  readonly from: string
  readonly settings: AllocationSettings
  readonly to: string
  readonly totals: {
    readonly expensesTotal: string
    readonly profit: string
    readonly revenue: string
    readonly tripCost: string
  }
  readonly unallocated: readonly {
    readonly amount: string
    readonly name: string
    readonly reason: string
  }[]
  readonly unallocatedTotal: string
}

export const CRITERION_LABELS: Record<AllocationCriterion, string> = {
  equal: 'igual para todas as viagens',
  per_km: 'por quilômetro',
  per_revenue: 'por faturamento',
  per_trip_day: 'por dia de viagem',
}

export const COST_GROUP_LABELS = {
  administrative: 'Contas administrativas',
  per_km: 'Contas por quilômetro',
  vehicle_fixed: 'Contas fixas do veículo',
} as const

export const UNALLOCATED_REASON_LABELS: Record<string, string> = {
  no_trip_weight: 'Nenhuma viagem com peso no critério',
  vehicle_without_trips: 'Veículo sem viagens no período',
}

/** `2026-10-31` → `31/10/2026`. */
export function formatCivilDate(value: string): string {
  const [year, month, day] = value.split('-')
  return year === undefined || month === undefined || day === undefined
    ? value
    : `${day}/${month}/${year}`
}

export function formatCalculatedAt(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(value)
}

/** `-1234.5` → `-1234,50`; o valor já vem com duas casas do cálculo. */
export function formatMoneyCsv(value: string): string {
  return value.replace('.', ',')
}

/** `1234567.89` → `R$ 1.234.567,89`. */
export function formatMoneyBrl(value: string): string {
  const negative = value.startsWith('-')
  const [whole = '0', fraction = '00'] = (negative ? value.slice(1) : value).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negative ? '-' : ''}R$ ${grouped},${fraction}`
}

/** Texto digitado por gente (nome de cliente) não vira fórmula na planilha. */
function textCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function exportFileName(
  document: ExpenseExportDocument,
  format: ExpenseExportFormat,
): string {
  return `resultado-contas-${document.from}-a-${document.to}.${format}`
}

const CSV_BOM = '﻿'
const EOL = '\r\n'

/** UTF-8 com BOM, separador `;` e decimal com vírgula, para abrir direto no Excel (RF20). */
export function buildExpenseResultCsv(document: ExpenseExportDocument): string {
  const rows: string[] = []
  const line = (...cells: string[]): void => {
    rows.push(cells.join(';'))
  }
  const money = formatMoneyCsv

  line(textCell('Resultado das contas'))
  line('Empresa', textCell(document.companyName))
  line('Período', `${formatCivilDate(document.from)} a ${formatCivilDate(document.to)}`)
  line('Filtros', textCell(document.filters.length === 0 ? 'Nenhum' : document.filters.join(' | ')))
  line(
    'Critério de rateio',
    textCell(
      (Object.keys(COST_GROUP_LABELS) as (keyof typeof COST_GROUP_LABELS)[])
        .map(
          (group) => `${COST_GROUP_LABELS[group]}: ${CRITERION_LABELS[document.settings[group]]}`,
        )
        .join(' | '),
    ),
  )
  line('Calculado em', formatCalculatedAt(document.calculatedAt))
  line()
  line(
    'Viagem',
    'Concluída em',
    'Veículo',
    'Cliente',
    'Frete',
    'Custo',
    'Rateio do veículo',
    'Rateio geral',
    'Margem',
  )
  for (const trip of document.byTrip) {
    line(
      textCell(trip.label),
      trip.completedOn === undefined ? '' : formatCivilDate(trip.completedOn),
      textCell(trip.vehicle ?? ''),
      textCell(trip.customer ?? ''),
      money(trip.revenue),
      money(trip.cost),
      money(trip.vehicleShare),
      money(trip.generalShare),
      money(trip.margin),
    )
  }
  line()
  line('Totais')
  line('Faturamento', money(document.totals.revenue))
  line('Custo das viagens', money(document.totals.tripCost))
  line('Contas do período', money(document.totals.expensesTotal))
  line('Resultado', money(document.totals.profit))
  line('Contas não rateadas', money(document.unallocatedTotal))
  for (const item of document.unallocated) {
    line(textCell(`Não rateada: ${item.name}`), money(item.amount), textCell(item.reason))
  }
  return CSV_BOM + rows.join(EOL) + EOL
}
