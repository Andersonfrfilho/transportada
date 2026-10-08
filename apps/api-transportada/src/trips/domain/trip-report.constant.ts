/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Spec 253 RF2: acima disto o relatório recusa em vez de truncar — planilha cortada parece inteira. */
export const TRIP_REPORT_MAX_ROWS = 5000

/** Spec 253 RF11: teto de canhotos do PDF; memória e tempo crescem com cada imagem lida. */
export const TRIP_PROOF_REPORT_MAX_DOCUMENTS = 200

export const TRIP_REPORT_DEFAULT_LIMIT = 100

/** Marcador de `contractorIdIn` para notas cujo emitente não tem cadastro de contratante. */
export const TRIP_REPORT_NO_CONTRACTOR_MARKER = 'none'

export const TRIP_REPORT_VALUE_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const

export type TripReportValueOperator = (typeof TRIP_REPORT_VALUE_OPERATORS)[number]

export const TRIP_REPORT_CURSOR_SEPARATOR = '::'
