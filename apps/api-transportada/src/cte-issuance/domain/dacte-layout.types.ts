/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Grade de 12 colunas: `width` é quantas delas o campo ocupa dentro da própria linha. */
export const DACTE_LAYOUT_COLUMNS = 12

export type DacteLayoutField = Readonly<{
  label: string
  value: string
  width: number
}>

export type DacteLayoutRow = Readonly<{
  fields: readonly DacteLayoutField[]
}>

export type DacteLayoutSection = Readonly<{
  rows: readonly DacteLayoutRow[]
  title: string
}>

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
