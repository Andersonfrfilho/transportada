/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { resolveDeliveryClientTab } from '../../src/modules/delivery-clients/pages/DeliveryClientWorkspace.page'

/**
 * Rodada de correção da Fase 4, item 12: `readDeliveryClientTabFromLocation` (montagem da página)
 * só embrulha esta função pura com a leitura de `window.location.search` — o parser em si, que é o
 * que decide `?tab=` conhecido versus desconhecido, é testável sem DOM.
 */
describe('parser da aba de delivery-clients (spec 150, correção Fase 4, item 12)', () => {
  test('id conhecido resolve para a própria aba', () => {
    expect(resolveDeliveryClientTab('mail')).toBe('mail')
    expect(resolveDeliveryClientTab('clients')).toBe('clients')
  })

  test('id desconhecido, ou ausente, cai em clients — URL inventada não pode quebrar a tela', () => {
    expect(resolveDeliveryClientTab('somethingNew')).toBe('clients')
    expect(resolveDeliveryClientTab('')).toBe('clients')
  })
})
