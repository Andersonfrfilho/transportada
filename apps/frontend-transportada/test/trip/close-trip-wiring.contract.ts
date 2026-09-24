/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const TRIP_DETAIL_SOURCE = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)

/**
 * Spec 156 T8c (ADR-0067), revisão do code-reviewer: três achados que só um contrato lendo o
 * arquivo (não a lógica isolada) prova — a lógica pura de `test/trip/close-trip.contract.ts` não
 * garante que `TripDetail` de fato a chama, nem que o botão usa a permissão certa, nem que o
 * diálogo só fecha depois do sucesso.
 */
describe('TripDetail liga o encerramento à permissão e à contagem certas (spec 156 T8c)', () => {
  test('o botão de encerrar usa trip.report-on-behalf, não trip.manage', () => {
    const source = readFileSync(TRIP_DETAIL_SOURCE, 'utf8')
    const buttonIndex = source.indexOf('onClick={handleCloseTrip}')
    const conditionStart = source.lastIndexOf('{canCloseTrip', buttonIndex)

    expect(buttonIndex).toBeGreaterThan(-1)
    expect(source).toContain('const canCloseTrip = workspace.controller.canReportOnBehalf')
    // O botão está sob o `{canCloseTrip …}` mais próximo antes dele, e não sob `canManage`.
    expect(conditionStart).toBeGreaterThan(-1)
    expect(source.slice(conditionStart, buttonIndex)).not.toContain('canManage &&')
  })

  test('a contagem de notas em aberto vem da mesma regra do servidor, não de um filtro inline', () => {
    const source = readFileSync(TRIP_DETAIL_SOURCE, 'utf8')

    expect(source).toContain('countOpenTripDocumentsForClose(trip.documents)')
    // Achado do code-reviewer: a divergência nascia exatamente neste filtro inline.
    expect(source).not.toContain('document.deliveredAt === null && document.returnedAt === null')
  })

  test('o diálogo só fecha dentro do onSuccess do mutate, nunca antes', () => {
    const source = readFileSync(TRIP_DETAIL_SOURCE, 'utf8')
    const submitStart = source.indexOf('function handleCloseTripSubmit')
    const submitEnd = source.indexOf('\n  }', submitStart)
    const body = source.slice(submitStart, submitEnd)

    expect(submitStart).toBeGreaterThan(-1)
    expect(body).toContain('onSuccess: () => setIsCloseDialogOpen(false)')
    // `setIsCloseDialogOpen(false)` só pode aparecer dentro do `onSuccess`, nunca solto no corpo.
    expect(body.replace('onSuccess: () => setIsCloseDialogOpen(false)', '')).not.toContain(
      'setIsCloseDialogOpen(false)',
    )
  })
  /**
   * Spec 158 T12: a API recusa `cancelled → completed` com 409. Oferecer o botão ali é ação sem
   * saída — o usuário digitaria o motivo para levar um erro.
   */
  test('o botão de encerrar não aparece em viagem cancelada', () => {
    const source = readFileSync(TRIP_DETAIL_SOURCE, 'utf8')
    const buttonIndex = source.indexOf("t('actions.close')")
    const conditionStart = source.lastIndexOf('{canCloseTrip', buttonIndex)

    expect(conditionStart).toBeGreaterThan(-1)
    expect(source.slice(conditionStart, buttonIndex)).toContain("trip.status !== 'cancelled'")
  })
})
