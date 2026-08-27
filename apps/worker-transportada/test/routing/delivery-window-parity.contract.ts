/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

import { resolveDeliveryWindow } from '../../src/routing/domain/delivery-window.policy.js'

const API_SOURCE = '../api-transportada/src/delivery-clients/domain/delivery-window.policy.ts'
const COPY = 'src/routing/domain/delivery-window.policy.ts'

describe('a janela do cliente no roteiro do pool (spec 058 P2 + 060 D2)', () => {
  /**
   * ⚠️ Cópia por valor. Se as duas divergirem, o roteiro proposto pelo worker e a conferência feita
   * pela API discordam sobre o mesmo cliente no mesmo dia — e quem descobre é o motorista, no portão.
   */
  test('é idêntica à política da API, linha a linha', async () => {
    const [copy, original] = await Promise.all([
      readFile(COPY, 'utf8'),
      readFile(API_SOURCE, 'utf8'),
    ])

    expect(afterHeader(copy)).toBe(afterHeader(original))
  })

  /** ADR-0048 §3: exceção do cliente **vence** feriado do município — o CD que abre no feriado manda. */
  test('a exceção do cliente vence o feriado da cidade', () => {
    const resolved = resolveDeliveryWindow({
      date: '2026-06-24',
      exceptions: [
        { closesAt: '18:00', exceptionOn: '2026-06-24', kind: 'open', opensAt: '08:00' },
      ],
      holidays: [{ holidayOn: '2026-06-24' }],
      windows: [{ closesAt: '17:00', opensAt: '08:00', weekday: 3 }],
    })

    expect(resolved.source).toBe('exception')
    expect(resolved.intervals).toEqual([{ closesAt: '18:00', opensAt: '08:00' }])
  })

  /**
   * Cliente **sem** cadastro de janela é ausência de restrição, não fechado — é o caso da maioria dos
   * destinatários, e tratá-lo como fechado travaria o roteiro no dia seguinte ao deploy.
   */
  test('sem cadastro é ausência de restrição, e sábado sem janela é fechado', () => {
    expect(
      resolveDeliveryWindow({ date: '2026-08-29', exceptions: [], holidays: [], windows: [] })
        .source,
    ).toBe('unset')

    const closed = resolveDeliveryWindow({
      /** 2026-08-29 é sábado; o cadastro só tem segunda a sexta. */
      date: '2026-08-29',
      exceptions: [],
      holidays: [],
      windows: [1, 2, 3, 4, 5].map((weekday) => ({
        closesAt: '17:00',
        opensAt: '08:00',
        weekday,
      })),
    })
    expect(closed.source).toBe('weekly')
    expect(closed.intervals).toEqual([])
  })
})

function afterHeader(source: string): string {
  return source.slice(source.indexOf('/** `HH:MM` ou `HH:MM:SS`')).trim()
}
