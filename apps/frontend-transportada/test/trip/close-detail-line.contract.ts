/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const TRIP_DETAIL_SOURCE = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)

/**
 * Spec 156 T8d: a tela mostra uma linha junto da situação quando a viagem foi encerrada à mão —
 * nada quando ela concluiu sozinha (os três nulos). Segue o molde de `close-trip-wiring.contract.ts`
 * (lê o arquivo, não a lógica isolada): o que importa é que **este** componente liga o campo novo à
 * tela, não que uma função pura em algum lugar saiba fazer a conta.
 */
describe('o detalhe mostra quem encerrou, quando e por quê (spec 156 T8d)', () => {
  const source = readFileSync(TRIP_DETAIL_SOURCE, 'utf8')

  test('a linha só aparece com closedAt preenchido', () => {
    expect(source).toContain('trip.closedAt === null || trip.closedAt === undefined ? null : (')
  })

  test('sem nome (pessoa removida), o texto não cita closedByName', () => {
    const guardIndex = source.indexOf(
      'trip.closedByName === null || trip.closedByName === undefined',
    )
    expect(guardIndex).toBeGreaterThan(-1)
    expect(source).toContain(
      "t('detail.closedManually', { moment: formatClosedAt(trip.closedAt) })",
    )
    expect(source).toContain("t('detail.closedManuallyBy'")
  })

  test('o motivo só entra quando closeReason não é vazio', () => {
    const reasonGuardIndex = source.indexOf(
      "trip.closeReason === null ||\n          trip.closeReason === undefined ||\n          trip.closeReason === ''",
    )
    expect(reasonGuardIndex).toBeGreaterThan(-1)
    expect(source).toContain("t('eventTimeline.closeReason', { reason: trip.closeReason })")
  })
})
