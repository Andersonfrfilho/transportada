/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.6: portas de nomes e de auditoria da exportação, em memória.
 */
import type { ExpenseExportPorts } from '../../src/expenses/application/expense-result.port.js'

export type RecordedExportAudit = Parameters<ExpenseExportPorts['exportAudit']['record']>[0]

export function buildInMemoryExportPorts(
  names: {
    readonly categories?: Record<string, string>
    readonly customers?: Record<string, string>
    readonly payees?: Record<string, string>
    readonly vehicles?: Record<string, string>
  } = {},
): ExpenseExportPorts & { readonly audits: RecordedExportAudit[] } {
  const audits: RecordedExportAudit[] = []
  return {
    audits,
    exportAudit: {
      record: (input) => {
        audits.push(input)
        return Promise.resolve()
      },
    },
    exportLabels: {
      read: ({ categoryId, customerIds, payeeDriverId, vehicleIds }) =>
        Promise.resolve({
          categoryName: categoryId === undefined ? null : (names.categories?.[categoryId] ?? null),
          companyName: 'Transportadora Teste',
          customers: new Map(
            customerIds.flatMap((id) =>
              names.customers?.[id] === undefined ? [] : [[id, names.customers[id]] as const],
            ),
          ),
          payeeName: payeeDriverId === undefined ? null : (names.payees?.[payeeDriverId] ?? null),
          vehicles: new Map(
            vehicleIds.flatMap((id) =>
              names.vehicles?.[id] === undefined ? [] : [[id, names.vehicles[id]] as const],
            ),
          ),
        }),
    },
  }
}
