/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { buildTripReportRows } from '../../src/modules/trip/shared/tripReportRows.service'
import type { TripReportRow } from '../../src/modules/trip/shared/tripReport.types'

const translate = (key: string): string => key

function buildRow(overrides: Partial<TripReportRow> = {}): TripReportRow {
  return {
    accessKey: '35260112345678000190550010000001231000001230',
    contractorName: 'Contratante Alfa',
    documentNumber: '123',
    documentSeries: '1',
    documentStatus: 'delivered',
    recipientCity: 'Campinas',
    recipientName: 'Destinatário Beta',
    recipientState: 'SP',
    tone: 'finished',
    tripId: 'abcdef12-0000-4000-8000-000000000000',
    ...overrides,
  }
}

function build(rows: readonly TripReportRow[]) {
  return buildTripReportRows({ locale: 'pt-BR', rows, translate })
}

describe('buildTripReportRows', () => {
  it('uma linha por nota, com o tom da API', () => {
    const { rows } = build([
      buildRow({ tone: 'warehouse' }),
      buildRow({ tone: 'on_route' }),
      buildRow({ tone: 'finished' }),
      buildRow({ tone: 'total_return' }),
    ])
    expect(rows.map((row) => row.tone)).toEqual([
      'warehouse',
      'on_route',
      'finished',
      'total_return',
    ])
  })

  it('sem valor na linha, a coluna de valor não existe', () => {
    const { columns, rows } = build([buildRow()])
    expect(columns.map((column) => column.header)).toEqual([
      'reportExport.columns.trip',
      'reportExport.columns.document',
      'reportExport.columns.accessKey',
      'reportExport.columns.contractor',
      'reportExport.columns.recipient',
      'reportExport.columns.city',
      'reportExport.columns.documentStatus',
      'reportExport.columns.deliveredAt',
      'reportExport.columns.returnedAt',
      'reportExport.columns.returnReason',
    ])
    expect(rows[0]?.cells).toHaveLength(columns.length)
  })

  it('com valor, a coluna entra depois da cidade e o dinheiro sai sem passar por float', () => {
    const { columns, rows } = build([buildRow({ amount: '12345678901234567.89' })])
    expect(columns[6]?.header).toBe('reportExport.columns.amount')
    expect(columns[6]?.align).toBe('right')
    expect(String(rows[0]?.cells[6])).toContain('12.345.678.901.234.567,89')
    expect(rows[0]?.cells).toHaveLength(columns.length)
  })

  it('formata nota, cidade/UF, situação e datas no padrão pt-BR', () => {
    const { rows } = build([
      buildRow({
        deliveredAt: '2026-09-30T13:05:00Z',
        documentStatus: 'returned',
        returnedAt: '2026-10-01T12:00:00Z',
        returnReason: 'Recusa do cliente',
      }),
    ])
    const cells = rows[0]?.cells ?? []
    expect(cells[0]).toBe('abcdef12')
    expect(cells[1]).toBe('123/1')
    expect(cells[5]).toBe('Campinas/SP')
    expect(cells[6]).toBe('filters.report.documentStatuses.returned')
    expect(String(cells[7])).toMatch(/^30\/09\/2026/)
    expect(String(cells[8])).toMatch(/^01\/10\/2026/)
    expect(cells[9]).toBe('Recusa do cliente')
  })

  it('campo ausente vira célula vazia, sem null nem undefined, e nunca traz CPF ou telefone', () => {
    const { columns, rows } = build([
      buildRow({ contractorName: null, recipientCity: null, recipientState: null }),
    ])
    const cells = rows[0]?.cells ?? []
    expect(cells[3]).toBe('')
    expect(cells[5]).toBe('')
    expect(cells[7]).toBe('')
    expect(cells[9]).toBe('')
    expect(columns.map((column) => column.header).join()).not.toMatch(/taxId|cpf|phone/i)
  })

  it('sem linhas, só cabeçalho e legenda', () => {
    const { columns, legend, rows } = build([])
    expect(rows).toEqual([])
    expect(columns).toHaveLength(10)
    expect(legend).toHaveLength(4)
  })

  it('a legenda traz as quatro cores, na ordem do ciclo da carga', () => {
    const { legend } = build([buildRow()])
    expect(legend).toEqual([
      { label: 'reportExport.legend.warehouse', tone: 'warehouse' },
      { label: 'reportExport.legend.on_route', tone: 'on_route' },
      { label: 'reportExport.legend.finished', tone: 'finished' },
      { label: 'reportExport.legend.total_return', tone: 'total_return' },
    ])
  })
})
