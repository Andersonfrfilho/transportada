/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

import type {
  FiscalSheetField,
  FiscalSheetRow,
  FiscalSheetSection,
} from '../../shared/fiscal-sheet.types.js'

export { FISCAL_SHEET_COLUMNS as DACTE_LAYOUT_COLUMNS } from '../../shared/fiscal-sheet.types.js'

export type DacteLayoutField = FiscalSheetField
export type DacteLayoutRow = FiscalSheetRow
export type DacteLayoutSection = FiscalSheetSection

export type DacteLayout = Readonly<{
  accessKeyGrouped: string
  barcodeValue: string
  emitter: Readonly<{ lines: readonly string[] }>
  invoiceKeys: readonly string[]
  issuedAt: string
  legend?: string
  modal: string
  number: string
  protocol?: string
  qrCodeValue?: string
  sections: readonly DacteLayoutSection[]
  series: string
}>
