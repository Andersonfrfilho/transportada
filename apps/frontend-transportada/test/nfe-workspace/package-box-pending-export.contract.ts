/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  createPackageBoxClient,
  PackageBoxRequestError,
  type PackageBox,
} from '../../src/modules/nfe-workspace/shared/packageBoxClient.service'
import {
  buildPackageBoxPendingExportCsv,
  buildPackageBoxPendingExportRows,
  buildPackageBoxPendingExportSheetData,
  PACKAGE_BOX_PENDING_EXPORT_COLUMNS,
  resolvePackageBoxPendingExportFeedback,
  packageBoxPendingExportFileName,
  type PackageBoxPendingExportLabels,
} from '../../src/modules/nfe-workspace/shared/packageBoxPendingExport.service'
import en from '../../src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json'
import nfeWorkspace from '../../src/modules/nfe-workspace/locales/nfeWorkspace.locale.json'

const PANEL = new URL(
  '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
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
  measurementHeader: {
    heightCm: 'Altura (cm)',
    lengthCm: 'Comprimento (cm)',
    measuredAt: 'Medida em',
    measuredByName: 'Medida por',
    unitsPerBox: 'Unidades por caixa',
    widthCm: 'Largura (cm)',
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
  measuredByName: null,
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
  measuredByName: null,
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

type CapturedRequest = { init?: RequestInit | undefined; url?: string }

function buildClient(
  input: Readonly<{ body: unknown; captured?: CapturedRequest; status?: number }>,
) {
  return createPackageBoxClient({
    apiUrl: 'https://api.test',
    fetch: (request, init) => {
      if (input.captured !== undefined) {
        input.captured.url = request instanceof Request ? request.url : request.toString()
        input.captured.init = init
      }
      return Promise.resolve(
        new Response(JSON.stringify(input.body), {
          headers: { 'content-type': 'application/json' },
          status: input.status ?? 200,
        }),
      )
    },
    getAccessToken: () => Promise.resolve('token'),
  })
}

/**
 * Export de "tudo o que falta medir" na aba Caixas: uma linha por caixa pendente, com as colunas
 * que identificam o produto e o que falta. A lista vem da rota própria da exportação, e é ela quem
 * diz se o arquivo ficou cortado.
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

  it('medidas e todas trazem as dimensões, a data e quem mediu; pendentes não', () => {
    const measured: PackageBox = {
      ...WITH_FAMILY_AND_GTIN,
      heightMm: 130,
      lengthMm: 190,
      measuredAt: '2026-10-01T15:30:00.000Z',
      measuredByName: 'Maria Lima',
      unitsPerBox: 24,
      widthMm: 185,
    }

    const pending = buildPackageBoxPendingExportSheetData({ boxes: [measured], labels: LABELS })
    const everything = buildPackageBoxPendingExportSheetData({
      boxes: [measured],
      labels: LABELS,
      status: 'measured',
    })

    expect(pending[0]).toHaveLength(7)
    expect(everything[0]?.slice(7)).toEqual([
      'Comprimento (cm)',
      'Largura (cm)',
      'Altura (cm)',
      'Unidades por caixa',
      'Medida em',
      'Medida por',
    ])
    expect(everything[1]?.slice(7)).toEqual([19, 18.5, 13, 24, '2026-10-01', 'Maria Lima'])
  })

  it('a caixa medida sem autor sai com o traço, e a pendente sem medida também', () => {
    const rows = buildPackageBoxPendingExportSheetData({
      boxes: [{ ...WITH_FAMILY_AND_GTIN, measuredAt: null, measuredByName: null }],
      labels: LABELS,
      status: 'all',
    })

    expect(rows[1]?.slice(7)).toEqual(['—', '—', '—', 1, '—', '—'])
  })

  it('o nome do arquivo diz a situação exportada', () => {
    const name = (status: 'all' | 'measured' | 'pending') =>
      packageBoxPendingExportFileName({ extension: 'xlsx', status, today: '2026-10-02' })

    expect(name('pending')).toBe('medidas-pendentes-caixas-2026-10-02.xlsx')
    expect(name('measured')).toBe('caixas-medidas-2026-10-02.xlsx')
    expect(name('all')).toBe('caixas-2026-10-02.xlsx')
  })

  it('pede a exportação com a situação escolhida na URL', async () => {
    const captured: CapturedRequest = {}
    await buildClient({
      body: { data: { items: [], truncated: false } },
      captured,
    }).listPendingExport({ status: 'measured' })

    expect(captured.url).toBe('https://api.test/nfe-package-boxes/pending-export?status=measured')
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

  it('pede a rota da exportação, sem parâmetro nenhum, e devolve itens e o corte', async () => {
    const captured: CapturedRequest = {}
    const result = await buildClient({
      body: { data: { items: [WITH_FAMILY_AND_GTIN], truncated: false } },
      captured,
    }).listPendingExport()

    expect(captured.url).toBe('https://api.test/nfe-package-boxes/pending-export')
    expect(captured.init?.method ?? 'GET').toBe('GET')
    expect(result).toEqual({ items: [WITH_FAMILY_AND_GTIN], truncated: false })
  })

  it('o corte vem da API — não da contagem de itens', async () => {
    const cut = await buildClient({
      body: { data: { items: [WITH_FAMILY_AND_GTIN], truncated: true } },
    }).listPendingExport()
    expect(cut.truncated).toBe(true)
    expect(cut.items).toHaveLength(1)

    const many = Array.from({ length: 250 }, (_, index) => ({
      ...WITH_FAMILY_AND_GTIN,
      id: `box-${index}`,
    }))
    const whole = await buildClient({
      body: { data: { items: many, truncated: false } },
    }).listPendingExport()
    expect(whole.truncated).toBe(false)
    expect(whole.items).toHaveLength(250)
  })

  /** Corpo que não é a exportação lança: arquivo vazio diria "não há o que medir". */
  it('recusa corpo sem o corte ou com item que não é caixa', async () => {
    for (const body of [
      { data: { items: [WITH_FAMILY_AND_GTIN] } },
      { data: { items: [WITH_FAMILY_AND_GTIN], truncated: 'no' } },
      { data: { items: [{ id: 1 }], truncated: false } },
      { data: { items: 'nada', truncated: false } },
      { items: [], truncated: false },
      null,
    ]) {
      const error = await buildClient({ body })
        .listPendingExport()
        .then(
          () => undefined,
          (caught: unknown) => caught,
        )
      expect(error).toBeInstanceOf(PackageBoxRequestError)
      expect((error as PackageBoxRequestError).code).toBe('PACKAGE_BOX_PENDING_EXPORT_MALFORMED')
    }
  })

  it('recusa da API chega com o código dela', async () => {
    const error = await buildClient({
      body: { error: { code: 'FORBIDDEN', message: 'Forbidden' } },
      status: 403,
    })
      .listPendingExport()
      .then(
        () => undefined,
        (caught: unknown) => caught,
      )

    expect(error).toBeInstanceOf(PackageBoxRequestError)
    expect((error as PackageBoxRequestError).code).toBe('FORBIDDEN')
    expect((error as PackageBoxRequestError).status).toBe(403)
  })

  it('o painel tem os dois botões de download', () => {
    const source = readFileSync(PANEL, 'utf8')

    expect(source).toInclude("t('packageBoxes.pendingExport.xlsx')")
    expect(source).toInclude("t('packageBoxes.pendingExport.csv')")
    expect(source).toInclude('useSpreadsheetExport')
    expect(source).not.toInclude('write-excel-file')
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

  it('o desfecho do clique: preparando, corte, vazio, 429 e falha', () => {
    const noResult = { error: null, isPending: false, result: undefined }
    expect(resolvePackageBoxPendingExportFeedback(noResult)).toEqual({ kind: 'idle' })
    expect(resolvePackageBoxPendingExportFeedback({ ...noResult, isPending: true })).toEqual({
      kind: 'preparing',
    })
    expect(
      resolvePackageBoxPendingExportFeedback({
        ...noResult,
        result: { items: [WITH_FAMILY_AND_GTIN], truncated: true },
      }),
    ).toEqual({ kind: 'truncated', total: 1 })
    expect(
      resolvePackageBoxPendingExportFeedback({
        ...noResult,
        result: { items: [WITH_FAMILY_AND_GTIN], truncated: false },
      }),
    ).toEqual({ kind: 'idle' })
    expect(
      resolvePackageBoxPendingExportFeedback({
        ...noResult,
        result: { items: [], truncated: false },
      }),
    ).toEqual({ kind: 'empty' })
    expect(
      resolvePackageBoxPendingExportFeedback({
        ...noResult,
        error: new PackageBoxRequestError({ code: 'TOO_MANY_REQUESTS', status: 429 }),
      }),
    ).toEqual({ kind: 'rateLimited' })
    expect(
      resolvePackageBoxPendingExportFeedback({
        ...noResult,
        error: new PackageBoxRequestError({
          code: 'PACKAGE_BOX_PENDING_EXPORT_FAILED',
          status: 500,
        }),
      }),
    ).toEqual({ kind: 'failed' })
    expect(
      resolvePackageBoxPendingExportFeedback({
        ...noResult,
        error: new TypeError('Failed to fetch'),
      }),
    ).toEqual({ kind: 'failed' })
  })

  /**
   * ⚠️ **Rótulo, não frase**: "Faltam medir: 1" erra o verbo justamente no fim do trabalho, e
   * `_one`/`_other` não salva — em pt-BR o zero cai no singular do CLDR, e o contador abria
   * "Medida: 0". "Por medir" é o mesmo substantivo do título do painel e não concorda com nada.
   */
  it('o contador do cabeçalho é invariável nos dois idiomas, com o total interpolado', () => {
    for (const locale of [nfeWorkspace, en]) {
      for (const key of ['measured', 'pending'] as const) {
        expect(locale.packageBoxes.counter[key]).toContain('{{count}}')
        expect(Object.keys(locale.packageBoxes.counter)).not.toContain(`${key}_one`)
      }
    }
    expect(nfeWorkspace.packageBoxes.counter.measured).toBe('Medidas: {{count}}')
    expect(nfeWorkspace.packageBoxes.counter.pending).toBe('Por medir: {{count}}')
  })

  it('o aviso de corte conta as caixas recebidas sem acionar plural, e os avisos do clique existem', () => {
    for (const locale of [nfeWorkspace, en]) {
      const messages = locale.packageBoxes.pendingExport
      expect(messages.truncated).toContain('{{total, number}}')
      expect(messages.truncated).not.toContain('{{count')
      expect(messages.truncated).not.toContain('200')
      expect(messages.preparing).toBeString()
      expect(messages.empty).toBeString()
      expect(messages.failed).toBeString()
      expect(messages.rateLimited).toBeString()
    }
    const pt = nfeWorkspace.packageBoxes.pendingExport
    expect(pt.truncated).toBe(
      'O arquivo traz as {{total, number}} primeiras caixas da fila — há mais caixas além delas.',
    )
    expect(pt.preparing).toBe('Preparando…')
    expect(pt.rateLimited).toBe('Muitas exportações seguidas. Tente de novo em alguns minutos.')
  })
})
