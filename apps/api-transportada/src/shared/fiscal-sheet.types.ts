/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Grade de 12 colunas: `width` é quantas delas o campo ocupa dentro da própria linha. */
export const FISCAL_SHEET_COLUMNS = 12

export type FiscalSheetField = Readonly<{
  label: string
  value: string
  width: number
}>

export type FiscalSheetRow = Readonly<{
  fields: readonly FiscalSheetField[]
}>

export type FiscalSheetSection = Readonly<{
  rows: readonly FiscalSheetRow[]
  title: string
}>

/**
 * O que DACTE e DAMDFE têm em comum é o **papel**: cabeçalho com emitente, sigla do documento,
 * código de barras da chave e protocolo, e daí para baixo seções de campos numa grade de 12.
 * O que muda é o conteúdo — e é por isso que o desenho mora aqui e o conteúdo mora em cada módulo.
 */
export type FiscalSheet = Readonly<{
  accessKeyGrouped: string
  barcodeValue: string
  emitter: Readonly<{ lines: readonly string[] }>
  /** Aviso de homologação: sem valor fiscal. Vermelho, centralizado, acima de tudo. */
  legend?: string
  /** A linha de identificação do documento: modal, série, número, emissão. */
  metaLine: string
  protocol?: string
  qrCodeValue?: string
  sections: readonly FiscalSheetSection[]
  /** Sigla impressa em corpo grande: `DACTE`, `DAMDFE`. */
  title: string
  /** O nome por extenso, embaixo da sigla. */
  subtitle: string
}>
