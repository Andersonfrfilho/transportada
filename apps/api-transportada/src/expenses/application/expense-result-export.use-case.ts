/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.6 (RF19, RF20, CA11): exporta o resultado em PDF ou CSV pelo **mesmo** cálculo da tela
 * (`computeExpenseResult`), com os mesmos filtros. Só põe nome nas linhas e formata; não refaz soma nenhuma.
 */
import {
  buildExpenseResultCsv,
  exportFileName,
  UNALLOCATED_REASON_LABELS,
  type ExpenseExportDocument,
  type ExpenseExportFormat,
  type ExpenseExportRow,
} from '../domain/expense-result-export.policy.js'
import {
  NO_CUSTOMER_ID,
  NO_VEHICLE_ID,
  type ExpenseResultFilters,
} from '../domain/expense-result-filters.policy.js'
import type { ExpenseExportPorts, ExpenseResultPorts } from './expense-result.port.js'
import { computeExpenseResult, type ExpenseResultLine } from './expense-result.use-case.js'

export type ExpenseResultPdfRenderer = (document: ExpenseExportDocument) => Promise<Uint8Array>

export type ExportExpenseResultInput = {
  readonly companyId: string
  readonly correlationId: string
  readonly filters?: ExpenseResultFilters
  readonly format: ExpenseExportFormat
  readonly from: string
  readonly to: string
  readonly userId: string
}

export type ExportedExpenseResult = {
  readonly body: Uint8Array | string
  readonly contentType: string
  readonly fileName: string
}

const CONTENT_TYPES: Record<ExpenseExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
}

export function createExportExpenseResultUseCase(dependencies: {
  readonly now?: () => Date
  readonly ports: ExpenseExportPorts & ExpenseResultPorts
  readonly renderPdf: ExpenseResultPdfRenderer
}): { execute(input: ExportExpenseResultInput): Promise<ExportedExpenseResult> } {
  const now = dependencies.now ?? ((): Date => new Date())
  return {
    execute: async (input) => {
      const filters = input.filters
      const computed = await computeExpenseResult(dependencies.ports, {
        companyId: input.companyId,
        ...(filters === undefined ? {} : { filters }),
        from: input.from,
        to: input.to,
      })
      const { result, trips } = computed
      const tripById = new Map(trips.map((trip) => [trip.tripId, trip]))
      const labels = await dependencies.ports.exportLabels.read({
        companyId: input.companyId,
        customerIds: [...new Set(trips.map((trip) => trip.customerId))],
        vehicleIds: [...new Set(trips.map((trip) => trip.vehicleId))],
        ...(filters?.categoryId === undefined ? {} : { categoryId: filters.categoryId }),
        ...(filters?.payeeDriverId === undefined ? {} : { payeeDriverId: filters.payeeDriverId }),
      })

      const vehicleLabel = (id: string): string =>
        id === NO_VEHICLE_ID ? 'Sem veículo' : (labels.vehicles.get(id) ?? id.slice(0, 8))
      const customerLabel = (id: string): string =>
        id === NO_CUSTOMER_ID ? 'Sem cliente' : (labels.customers.get(id) ?? id.slice(0, 8))
      const row = (line: ExpenseResultLine, label: string): ExpenseExportRow => ({
        cost: line.cost,
        generalShare: line.generalShare,
        label,
        margin: line.margin,
        revenue: line.revenue,
        vehicleShare: line.vehicleShare,
      })

      const filterTexts: string[] = []
      if (filters?.vehicleId !== undefined) {
        filterTexts.push(`Veículo: ${vehicleLabel(filters.vehicleId)}`)
      }
      if (filters?.customerId !== undefined) {
        filterTexts.push(`Cliente: ${customerLabel(filters.customerId)}`)
      }
      if (filters?.categoryId !== undefined) {
        filterTexts.push(`Categoria: ${labels.categoryName ?? filters.categoryId.slice(0, 8)}`)
      }
      if (filters?.payeeDriverId !== undefined) {
        filterTexts.push(
          `Motorista, agregado ou ajudante: ${labels.payeeName ?? filters.payeeDriverId.slice(0, 8)}`,
        )
      }

      const document: ExpenseExportDocument = {
        byCustomer: result.byCustomer.map((line) => row(line, customerLabel(line.id))),
        byTrip: result.byTrip.map((line) => {
          const trip = tripById.get(line.id)
          return {
            ...row(line, line.id.slice(0, 8)),
            ...(trip === undefined
              ? {}
              : {
                  completedOn: trip.completedOn,
                  customer: customerLabel(trip.customerId),
                  vehicle: vehicleLabel(trip.vehicleId),
                }),
          }
        }),
        byVehicle: result.byVehicle.map((line) => row(line, vehicleLabel(line.id))),
        calculatedAt: now(),
        companyName: labels.companyName,
        filters: filterTexts,
        from: input.from,
        settings: result.settings ?? {
          administrative: 'per_revenue',
          per_km: 'per_km',
          vehicle_fixed: 'per_km',
        },
        to: input.to,
        totals: result.totals,
        unallocated: (result.unallocatedItems ?? []).map((item) => ({
          amount: item.amount,
          name: item.name,
          reason: UNALLOCATED_REASON_LABELS[item.reason] ?? item.reason,
        })),
        unallocatedTotal: result.unallocatedTotal,
      }

      const body =
        input.format === 'csv'
          ? buildExpenseResultCsv(document)
          : await dependencies.renderPdf(document)
      await dependencies.ports.exportAudit.record({
        companyId: input.companyId,
        correlationId: input.correlationId,
        filters: { ...filters },
        format: input.format,
        from: input.from,
        to: input.to,
        userId: input.userId,
      })
      return {
        body,
        contentType: CONTENT_TYPES[input.format],
        fileName: exportFileName(document, input.format),
      }
    },
  }
}
