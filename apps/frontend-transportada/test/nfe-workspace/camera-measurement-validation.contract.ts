/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  buildCameraMeasurementCsv,
  CAMERA_MEASUREMENT_EXPORT_COLUMNS,
} from '../../src/modules/nfe-workspace/shared/cameraMeasurementExport.service'
import {
  summarizeCameraMeasurementValidation,
  type CameraMeasurementExportEntry,
} from '../../src/modules/nfe-workspace/shared/cameraMeasurementValidation.service'

function entry(overrides: Partial<CameraMeasurementExportEntry>): CameraMeasurementExportEntry {
  return {
    cartonGtin: null,
    createdAt: '2026-09-15T12:00:00.000Z',
    heightMarginMm: null,
    heightMm: 200,
    id: 'measurement-1',
    lengthMarginMm: null,
    lengthMm: 300,
    productCode: 'PROD-1',
    proposedHeightMm: null,
    proposedLengthMm: null,
    proposedWidthMm: null,
    source: 'camera',
    warnings: [],
    widthMarginMm: null,
    widthMm: 250,
    ...overrides,
  }
}

/**
 * Spec 152 T12 (R6/R8): resumo da validação com o dado real do histórico (T5) — margem some quando
 * a dimensão foi editada (T10), então "dentro da margem" só conta leituras com margem conhecida.
 */
describe('resumo da validação da medida pela câmera (spec 152 R6)', () => {
  test('caixa typed não gera leitura nenhuma (sem proposta para comparar)', () => {
    const summary = summarizeCameraMeasurementValidation([entry({ source: 'typed' })])

    expect(summary.readingCount).toBe(0)
    expect(summary.withinTenMillimetreRate).toBeNull()
    expect(summary.withinMarginRate).toBeNull()
    expect(summary.verdict).toBe('insufficient-data')
  })

  test('dimensão editada perde a margem, mas continua contando para o erro de 10 mm', () => {
    const summary = summarizeCameraMeasurementValidation([
      entry({
        lengthMarginMm: null,
        lengthMm: 305,
        proposedLengthMm: 300,
        source: 'camera_adjusted',
      }),
    ])

    expect(summary.readingCount).toBe(1)
    expect(summary.withinTenMillimetreCount).toBe(1)
    expect(summary.withinMarginKnownCount).toBe(0)
    expect(summary.withinMarginRate).toBeNull()
  })

  test('fronteira de 80%/90% (R6): exatamente no piso é go', () => {
    const readings = Array.from({ length: 10 }, (_, index) =>
      entry({
        id: `measurement-${index}`,
        lengthMarginMm: 12,
        // 8 de 10 com erro <= 10mm (piso de 80%), 9 de 10 dentro da margem de 12mm (piso de 90%)
        lengthMm: index < 8 ? 305 : 330,
        proposedLengthMm: 300,
        source: 'camera',
      }),
    )
    // ajusta a nona leitura para ficar dentro da margem (erro 12) mas fora dos 10mm
    const adjusted = readings.map((row, index) =>
      index === 8 ? entry({ ...row, lengthMm: 312 }) : row,
    )

    const summary = summarizeCameraMeasurementValidation(adjusted)

    expect(summary.withinTenMillimetreRate).toBe(0.8)
    expect(summary.withinMarginRate).toBe(0.9)
    expect(summary.verdict).toBe('go')
  })

  test('margem otimista (maior que o erro real de fita) reprova quando abaixo do piso', () => {
    const readings = Array.from({ length: 10 }, (_, index) =>
      entry({
        id: `measurement-${index}`,
        // margem otimista de 5mm, mas o erro real (fita x câmera) é sempre 20mm: reprova
        lengthMarginMm: 5,
        lengthMm: 320,
        proposedLengthMm: 300,
        source: index < 9 ? 'camera' : 'camera_adjusted',
      }),
    )

    const summary = summarizeCameraMeasurementValidation(readings)

    expect(summary.withinMarginRate).toBe(0)
    expect(summary.withinTenMillimetreRate).toBe(0)
    expect(summary.verdict).toBe('no-go')
  })

  test('go exige as duas taxas ao mesmo tempo, não só uma delas', () => {
    const summary = summarizeCameraMeasurementValidation([
      entry({ lengthMarginMm: 50, lengthMm: 300, proposedLengthMm: 300, source: 'camera' }),
    ])

    // dentro da margem 100% (50mm), mas só 1 leitura com erro 0 <= 10mm também — força um caso misto
    const mixed = summarizeCameraMeasurementValidation([
      entry({ lengthMarginMm: 50, lengthMm: 340, proposedLengthMm: 300, source: 'camera' }),
    ])

    expect(summary.verdict).toBe('go')
    expect(mixed.withinMarginRate).toBe(1)
    expect(mixed.withinTenMillimetreRate).toBe(0)
    expect(mixed.verdict).toBe('no-go')
  })
})

describe('CSV do histórico da câmera (spec 152 R8)', () => {
  test('colunas do spike, nesta ordem', () => {
    expect(CAMERA_MEASUREMENT_EXPORT_COLUMNS).toEqual([
      'caixa',
      'dimensao',
      'fita_mm',
      'camera_mm',
      'erro_mm',
      'margem_mm',
      'dentro_da_margem',
      'motivos',
      'origem',
      'gravado_em',
    ])
  })

  test('linha typed não entra (não há proposta da câmera para validar)', () => {
    const csv = buildCameraMeasurementCsv([entry({ source: 'typed' })])
    const lines = csv.replace('﻿', '').split('\r\n')

    expect(lines).toHaveLength(1)
  })

  test('uma linha por dimensão, com fita/câmera/erro/margem e sem descrição do produto', () => {
    const csv = buildCameraMeasurementCsv([
      entry({
        cartonGtin: '07891234567895',
        heightMarginMm: 8,
        heightMm: 202,
        lengthMarginMm: null,
        lengthMm: 305,
        productCode: 'PROD-9',
        proposedHeightMm: 200,
        proposedLengthMm: 300,
        proposedWidthMm: null,
        source: 'camera_adjusted',
        warnings: ['lowLight'],
        widthMm: 250,
      }),
    ])

    expect(csv).not.toContain('descrição')
    expect(csv).toContain('PROD-9')
    expect(csv).toContain('07891234567895')
    expect(csv).toContain('lowLight')

    const lines = csv.replace('﻿', '').split('\r\n')
    expect(lines).toHaveLength(4) // cabeçalho + comprimento + largura + altura

    const heightRow = lines[3]
    expect(heightRow).toBeDefined()
    // erro = |200 - 202| = 2mm, dentro da margem de 8mm
    expect(heightRow).toContain('"2"')
    expect(heightRow).toContain('"8"')
    expect(heightRow).toContain('"sim"')

    const lengthRow = lines[1]
    expect(lengthRow).toBeDefined()
    // largura sem proposta (widthMm null) e comprimento editado, sem margem gravada
    expect(lengthRow).toContain('""') // margem em branco
  })
})
