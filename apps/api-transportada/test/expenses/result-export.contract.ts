/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.6 (RF19, RF20, CA11): PDF e CSV saem do mesmo cálculo da tela, com os mesmos filtros, e a exportação
 * fica no diário. A planilha abre no Excel (UTF-8 com BOM, `;` e vírgula decimal).
 */
import { describe, expect, it } from 'bun:test'

import { createExportExpenseResultUseCase } from '../../src/expenses/application/expense-result-export.use-case.js'
import { createGetExpenseResultUseCase } from '../../src/expenses/application/expense-result.use-case.js'
import { renderExpenseResultPdf } from '../../src/expenses/infrastructure/expense-result-pdf.gateway.js'
import {
  aTrip,
  anOccurrence,
  buildInMemoryExpenseResult,
  CUSTOMER_1,
  CUSTOMER_2,
  RESULT_COMPANY_A,
  VEHICLE_1,
  VEHICLE_2,
} from '../fixtures/expense-result-in-memory.fixture.js'
import { buildInMemoryExportPorts } from '../fixtures/expense-export-ports.fixture.js'

const PERIOD = { from: '2026-10-01', to: '2026-10-31' } as const
const NOW = new Date('2026-11-13T15:30:00Z')

function build() {
  const result = buildInMemoryExpenseResult()
  result.tripRows.push(
    aTrip({
      cost: '300.00',
      customerId: CUSTOMER_1,
      revenue: '1000.00',
      tripId: 'aaaaaaaa-1',
      vehicleId: VEHICLE_1,
    }),
    aTrip({
      cost: '500.00',
      customerId: CUSTOMER_2,
      revenue: '3000.50',
      tripId: 'bbbbbbbb-2',
      vehicleId: VEHICLE_2,
    }),
  )
  result.occurrenceRows.push(
    anOccurrence({
      categoryId: 'cat-rent',
      costGroup: 'administrative',
      expectedAmount: '1000.01',
      occurrenceId: 'rent',
    }),
    anOccurrence({
      categoryId: 'cat-ins',
      costGroup: 'vehicle_fixed',
      expectedAmount: '400.00',
      occurrenceId: 'ins',
      vehicleId: VEHICLE_2,
    }),
  )
  const exportPorts = buildInMemoryExportPorts({
    categories: { 'cat-rent': 'Aluguel' },
    customers: { [CUSTOMER_1]: '=Cliente Um; "SA"', [CUSTOMER_2]: 'Cliente Dois' },
    vehicles: { [VEHICLE_1]: 'ABC1D23', [VEHICLE_2]: 'XYZ9K88' },
  })
  const exporter = createExportExpenseResultUseCase({
    now: () => NOW,
    ports: { ...result, ...exportPorts },
    renderPdf: renderExpenseResultPdf,
  })
  return { exporter, exportPorts, getResult: createGetExpenseResultUseCase(result) }
}

const base = { companyId: RESULT_COMPANY_A, correlationId: 'corr-1', userId: 'user-1', ...PERIOD }

describe('exportação do resultado (spec 325 T4.6)', () => {
  it('a planilha abre no Excel: BOM, separador ; e vírgula decimal', async () => {
    const { exporter } = build()
    const out = await exporter.execute({ ...base, format: 'csv' })
    const csv = out.body as string

    expect(out.contentType).toBe('text/csv; charset=utf-8')
    expect(out.fileName).toBe('resultado-contas-2026-10-01-a-2026-10-31.csv')
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('Período;01/10/2026 a 31/10/2026')
    expect(csv).toContain(
      'Viagem;Concluída em;Veículo;Cliente;Frete;Custo;Rateio do veículo;Rateio geral;Margem',
    )
    expect(csv).toContain('3000,50')
    expect(csv).not.toMatch(/\d\.\d\d;/)
  })

  it('uma linha por viagem, com nome de veículo e cliente, e o texto digitado não vira fórmula', async () => {
    const { exporter } = build()
    const csv = (await exporter.execute({ ...base, format: 'csv' })).body as string
    const lines = csv.split('\r\n')
    const header = lines.findIndex((line) => line.startsWith('Viagem;'))
    const trips = lines.slice(header + 1, lines.indexOf('', header))

    expect(trips).toHaveLength(2)
    expect(trips[0]).toContain('ABC1D23')
    expect(trips[0]).toContain(`"'=Cliente Um; ""SA"""`)
  })

  it('CA11: os totais da planilha são os da tela, centavo a centavo, com e sem filtro', async () => {
    const { exporter, getResult } = build()
    for (const filters of [undefined, { vehicleId: VEHICLE_2 }, { categoryId: 'cat-rent' }]) {
      const screen = await getResult.execute({
        companyId: RESULT_COMPANY_A,
        ...(filters === undefined ? {} : { filters }),
        ...PERIOD,
      })
      const csv = (
        await exporter.execute({
          ...base,
          ...(filters === undefined ? {} : { filters }),
          format: 'csv',
        })
      ).body as string
      const comma = (value: string): string => value.replace('.', ',')

      expect(csv).toContain(`\r\nFaturamento;${comma(screen.totals.revenue)}\r\n`)
      expect(csv).toContain(`\r\nCusto das viagens;${comma(screen.totals.tripCost)}\r\n`)
      expect(csv).toContain(`\r\nContas do período;${comma(screen.totals.expensesTotal)}\r\n`)
      expect(csv).toContain(`\r\nResultado;${comma(screen.totals.profit)}\r\n`)
      expect(csv).toContain(`\r\nContas não rateadas;${comma(screen.unallocatedTotal)}`)
      for (const trip of screen.byTrip) {
        expect(csv).toContain(`;${comma(trip.margin)}\r\n`)
      }
    }
  })

  it('o cabeçalho diz os filtros aplicados pelo nome', async () => {
    const { exporter } = build()
    const csv = (
      await exporter.execute({
        ...base,
        filters: { categoryId: 'cat-rent', vehicleId: VEHICLE_2 },
        format: 'csv',
      })
    ).body as string

    expect(csv).toContain('Filtros;Veículo: XYZ9K88 | Categoria: Aluguel')
    expect(csv).toContain('Empresa;Transportadora Teste')
  })

  it('o PDF é um PDF de verdade, gerado no servidor', async () => {
    const { exporter } = build()
    const out = await exporter.execute({ ...base, format: 'pdf' })
    const bytes = out.body as Uint8Array

    expect(out.contentType).toBe('application/pdf')
    expect(out.fileName.endsWith('.pdf')).toBe(true)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it('toda exportação fica no diário, com formato, período e filtros', async () => {
    const { exporter, exportPorts } = build()
    await exporter.execute({ ...base, filters: { vehicleId: VEHICLE_1 }, format: 'pdf' })
    await exporter.execute({ ...base, format: 'csv' })

    expect(exportPorts.audits).toEqual([
      {
        companyId: RESULT_COMPANY_A,
        correlationId: 'corr-1',
        filters: { vehicleId: VEHICLE_1 },
        format: 'pdf',
        from: '2026-10-01',
        to: '2026-10-31',
        userId: 'user-1',
      },
      {
        companyId: RESULT_COMPANY_A,
        correlationId: 'corr-1',
        filters: {},
        format: 'csv',
        from: '2026-10-01',
        to: '2026-10-31',
        userId: 'user-1',
      },
    ])
  })
})
