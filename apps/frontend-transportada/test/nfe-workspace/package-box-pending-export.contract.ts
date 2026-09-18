/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import type { PackageBox } from '../../src/modules/nfe-workspace/shared/packageBoxClient.service'
import {
  buildPackageBoxPendingExportCsv,
  buildPackageBoxPendingExportRows,
  buildPackageBoxPendingExportSheetData,
  isPackageBoxPendingExportTruncated,
  PACKAGE_BOX_PENDING_EXPORT_COLUMNS,
  PACKAGE_BOX_PENDING_EXPORT_LIMIT,
  packageBoxPendingExportFileName,
  type PackageBoxPendingExportLabels,
} from '../../src/modules/nfe-workspace/shared/packageBoxPendingExport.service'
import en from '../../src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json'
import nfeWorkspace from '../../src/modules/nfe-workspace/locales/nfeWorkspace.locale.json'

const PANEL = new URL(
  '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
  import.meta.url,
)
const CLIENT = new URL(
  '../../src/modules/nfe-workspace/shared/packageBoxClient.service.ts',
  import.meta.url,
)

const LABELS: PackageBoxPendingExportLabels = {
  emptyValue: '—',
  header: {
    cartonGtin: 'GTIN da caixa',
    commercialUnit: 'Embalagem',
    description: 'Descrição',
    emitterTaxId: 'CNPJ emitente',
    familyKey: 'Família',
    productCode: 'Código do produto',
    transportedVolumes: 'Quantidade pendente',
  },
}

const WITH_FAMILY_AND_GTIN: PackageBox = {
  cartonGtin: '7891000100103',
  commercialUnit: 'CX24',
  cumulativeShare: 0.6,
  description: 'ENERG RED BULL 250ML',
  emitterTaxId: '05868574001090',
  familyKey: 'RED BULL',
  familyMeasuredCount: 1,
  familyPendingCount: 1,
  grossWeightGrams: 10867,
  heightMm: null,
  id: '11111111-1111-4111-8111-111111111111',
  lengthMm: null,
  measuredAt: null,
  measurementMarginMm: null,
  measurementSource: null,
  packagingSiblingCount: 0,
  packagingUnitCount: undefined,
  productCode: '18245',
  share: 0.6,
  transportedVolumes: 60,
  unitsPerBox: 1,
  variantLabel: '',
  widthMm: null,
  withinCoverage: true,
}

const WITHOUT_DESCRIPTION_OR_FAMILY: PackageBox = {
  cartonGtin: null,
  commercialUnit: 'UN',
  cumulativeShare: 0.8,
  description: '',
  emitterTaxId: '12345678000199',
  familyKey: undefined,
  familyMeasuredCount: 0,
  familyPendingCount: 0,
  grossWeightGrams: null,
  heightMm: null,
  id: '22222222-2222-4222-8222-222222222222',
  lengthMm: null,
  measuredAt: null,
  measurementMarginMm: null,
  measurementSource: null,
  packagingSiblingCount: 0,
  packagingUnitCount: undefined,
  productCode: 'P,"9"',
  share: 0.2,
  transportedVolumes: 4,
  unitsPerBox: 1,
  variantLabel: '',
  widthMm: null,
  withinCoverage: false,
}

/**
 * Export de "tudo o que falta medir" na aba Caixas: uma linha por caixa pendente, com as colunas
 * que identificam o produto e o que falta, e o teto documentado da API sem paginação por cursor.
 */
describe('exportar a fila de caixas pendentes em CSV/Excel', () => {
  it('lê GTIN e família quando existem, e usa o valor vazio quando não existem', () => {
    const rows = buildPackageBoxPendingExportRows({
      boxes: [WITH_FAMILY_AND_GTIN, WITHOUT_DESCRIPTION_OR_FAMILY],
      labels: LABELS,
    })

    expect(rows[0]).toEqual([
      '18245',
      'ENERG RED BULL 250ML',
      '7891000100103',
      '05868574001090',
      'RED BULL',
      'CX24',
      60,
    ])
    expect(rows[1]).toEqual(['P,"9"', 'P,"9"', '—', '12345678000199', '—', 'UN', 4])
  })

  it('a descrição cai para o código do produto quando vem vazia, igual à fila', () => {
    const rows = buildPackageBoxPendingExportRows({
      boxes: [WITHOUT_DESCRIPTION_OR_FAMILY],
      labels: LABELS,
    })

    expect(rows[0]?.[1]).toBe('P,"9"')
  })

  it('a quantidade pendente chega como número na planilha', () => {
    const sheetData = buildPackageBoxPendingExportSheetData({
      boxes: [WITH_FAMILY_AND_GTIN],
      labels: LABELS,
    })

    expect(typeof sheetData[1]?.[6]).toBe('number')
  })

  it('o cabeçalho segue a ordem das colunas declaradas', () => {
    const sheetData = buildPackageBoxPendingExportSheetData({ boxes: [], labels: LABELS })

    expect(sheetData[0]).toEqual(
      PACKAGE_BOX_PENDING_EXPORT_COLUMNS.map((column) => LABELS.header[column]),
    )
  })

  it('o CSV tem BOM e escapa vírgula/aspas do código de produto', () => {
    const csv = buildPackageBoxPendingExportCsv({
      boxes: [WITHOUT_DESCRIPTION_OR_FAMILY],
      labels: LABELS,
    })

    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toInclude('"P,""9"""')
  })

  it('o nome do arquivo leva a data, sem dado pessoal', () => {
    expect(packageBoxPendingExportFileName({ extension: 'csv', today: '2026-09-18' })).toBe(
      'medidas-pendentes-caixas-2026-09-18.csv',
    )
    expect(packageBoxPendingExportFileName({ extension: 'xlsx', today: '2026-09-18' })).toBe(
      'medidas-pendentes-caixas-2026-09-18.xlsx',
    )
  })

  it('o cliente manda o limite documentado da API — a exportação nunca fica no padrão de 50', () => {
    const source = readFileSync(CLIENT, 'utf8')

    expect(source).toInclude("if (input?.limit !== undefined) url.searchParams.set('limit'")
    expect(PACKAGE_BOX_PENDING_EXPORT_LIMIT).toBe(200)
  })

  it('o painel tem os dois botões de download, desabilitados sem itens para exportar', () => {
    const source = readFileSync(PANEL, 'utf8')

    expect(source).toInclude("t('packageBoxes.pendingExport.xlsx')")
    expect(source).toInclude("t('packageBoxes.pendingExport.csv')")
    expect(source).toInclude('pendingExport.boxes.length === 0')
    expect(source).toInclude("import('write-excel-file/browser')")
  })

  it('os rótulos e as colunas existem em pt e em en', () => {
    expect(nfeWorkspace.packageBoxes.pendingExport.csv).toBeString()
    expect(nfeWorkspace.packageBoxes.pendingExport.xlsx).toBeString()
    expect(en.packageBoxes.pendingExport.csv).toBeString()
    expect(en.packageBoxes.pendingExport.xlsx).toBeString()
    for (const column of PACKAGE_BOX_PENDING_EXPORT_COLUMNS) {
      expect(nfeWorkspace.packageBoxes.pendingExport.columns[column]).toBeString()
      expect(en.packageBoxes.pendingExport.columns[column]).toBeString()
    }
  })

  it('avisa quando a lista bateu no teto da API — arquivo cortado não pode parecer a fila inteira', () => {
    expect(isPackageBoxPendingExportTruncated(PACKAGE_BOX_PENDING_EXPORT_LIMIT - 1)).toBe(false)
    expect(isPackageBoxPendingExportTruncated(PACKAGE_BOX_PENDING_EXPORT_LIMIT)).toBe(true)
    expect(nfeWorkspace.packageBoxes.pendingExport.truncated).toContain('{{limit}}')
    expect(en.packageBoxes.pendingExport.truncated).toContain('{{limit}}')
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain('pendingExport.isTruncated')
  })
})
