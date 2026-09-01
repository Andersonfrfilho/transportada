/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  isSchedulable,
  isTrackable,
  toDeliveryView,
} from '../../src/modules/deliveries/shared/deliveryStatus.service'
import type { Delivery } from '../../src/modules/shared/portal.types'

function delivery(overrides: Partial<Delivery> = {}): Delivery {
  return {
    accessKey: `3526${'1'.repeat(40)}`,
    deliveredAt: null,
    estimatedArrivalAt: null,
    issuedAt: '2026-08-27T09:00:00.000Z',
    number: '900001',
    returnReason: null,
    separationStatus: null,
    series: '1',
    tripStatus: null,
    ...overrides,
  }
}

describe('o vocabulário do cliente (spec 063 T010)', () => {
  /**
   * `separating`/`loaded` é o que acontece no galpão da transportadora; o cliente quer saber se a
   * nota **saiu**. Se essa tradução não existisse, a tela mostraria o jargão da operação alheia.
   */
  test('traduz o estado da operação para o que o cliente pergunta', () => {
    expect(toDeliveryView(delivery()).label).toBe('Recebida')
    expect(toDeliveryView(delivery({ separationStatus: 'separated' })).label).toBe('Em separação')
    expect(
      toDeliveryView(delivery({ separationStatus: 'loaded', tripStatus: 'dispatched' })).label,
    ).toBe('A caminho')
    expect(toDeliveryView(delivery({ deliveredAt: '2026-08-28T12:00:00.000Z' })).label).toBe(
      'Entregue',
    )
    expect(toDeliveryView(delivery({ separationStatus: 'returned' })).label).toBe('Devolvida')
  })

  /** Devolvida vence entregue: a nota que voltou não é entrega concluída, e o badge é de alerta. */
  test('a devolução vence os outros estados', () => {
    const view = toDeliveryView(
      delivery({ deliveredAt: '2026-08-28T12:00:00.000Z', separationStatus: 'returned' }),
    )

    expect(view.label).toBe('Devolvida')
    expect(view.badge).toBe('alert')
  })

  /** O mapa só existe enquanto a carga está na rua — depois disso o rastro nem existe mais no banco. */
  test('só rastreia o que está a caminho', () => {
    expect(isTrackable(delivery({ tripStatus: 'in_transit' }))).toBe(true)
    expect(isTrackable(delivery())).toBe(false)
    expect(isTrackable(delivery({ deliveredAt: '2026-08-28T12:00:00.000Z' }))).toBe(false)
  })

  /** Agendar depois de a carga sair seria agendar a janela que já passou. */
  test('só agenda antes da saída', () => {
    expect(isSchedulable(delivery())).toBe(true)
    expect(isSchedulable(delivery({ separationStatus: 'separated' }))).toBe(true)
    expect(isSchedulable(delivery({ tripStatus: 'dispatched' }))).toBe(false)
  })
})
