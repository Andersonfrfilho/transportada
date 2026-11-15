/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  deliveriesToCsv,
  escapeCsvCell,
  summarizeDeliveries,
} from '../../src/modules/reports/deliveryReport.service'
import type { Delivery } from '../../src/modules/shared/portal.types'

const BASE: Delivery = {
  accessKey: '1'.repeat(44),
  deliveredAt: null,
  estimatedArrivalAt: null,
  issuedAt: '2026-11-01T10:00:00.000Z',
  number: '10',
  returnReason: null,
  separationStatus: null,
  series: '1',
  tripStatus: null,
}

describe('relatório de entregas (spec 340)', () => {
  test('separa no prazo de atrasada pela previsão da própria nota', () => {
    const summary = summarizeDeliveries(
      [
        {
          ...BASE,
          deliveredAt: '2026-11-05T10:00:00Z',
          estimatedArrivalAt: '2026-11-06T10:00:00Z',
          separationStatus: 'delivered',
        },
        {
          ...BASE,
          deliveredAt: '2026-11-07T10:00:00Z',
          estimatedArrivalAt: '2026-11-06T10:00:00Z',
          separationStatus: 'delivered',
        },
      ],
      [],
      new Date('2026-11-15T00:00:00Z'),
    )

    expect(summary.onTime).toBe(1)
    expect(summary.late).toBe(1)
    expect(summary.delivered).toBe(2)
  })

  test('célula que o Excel executaria como fórmula vira texto', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1")
    expect(escapeCsvCell('@cmd')).toBe("'@cmd")
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
  })

  test('o CSV não carrega chave de acesso nem valor', () => {
    const csv = deliveriesToCsv([BASE])

    expect(csv).not.toContain(BASE.accessKey)
    expect(csv.split('\r\n')[0]).toBe(
      'Nota,Série,Emissão,Situação,Previsão,Entregue em,Motivo da devolução',
    )
  })
})
