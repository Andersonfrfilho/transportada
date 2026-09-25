/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { describeDeliveryWindow } from '@/modules/driver-trip/shared/deliveryWindow.service'

/** O relógio da parada é o do lugar da entrega; o teste fixa o fuso para não depender da máquina. */
const TIME_ZONE = 'America/Sao_Paulo'

/**
 * ADR-0075 §8, RF13: `deliveryWindowStart/End` já chegam validados na resposta e nunca apareciam
 * no cartão. A API grava os dois juntos (`trip_stops` tem `check` de "os dois ou nenhum"), mas o
 * formatador não confia nisso: um lado só ainda diz alguma coisa verdadeira ao motorista.
 */
describe('a janela de entrega no cartão da parada (spec 189 T7.3)', () => {
  it('os dois lados: das 08:00 às 12:00', () => {
    expect(
      describeDeliveryWindow({
        end: '2026-09-25T15:00:00.000Z',
        start: '2026-09-25T11:00:00.000Z',
        timeZone: TIME_ZONE,
      }),
    ).toEqual({ end: '12:00', kind: 'between', start: '08:00' })
  })

  it('só o começo: a partir das 08:00', () => {
    expect(
      describeDeliveryWindow({ end: null, start: '2026-09-25T11:00:00.000Z', timeZone: TIME_ZONE }),
    ).toEqual({ kind: 'from', start: '08:00' })
  })

  it('só o fim: até as 12:00', () => {
    expect(
      describeDeliveryWindow({ end: '2026-09-25T15:00:00.000Z', start: null, timeZone: TIME_ZONE }),
    ).toEqual({ end: '12:00', kind: 'until' })
  })

  /** A maioria das paradas não tem janela: ausência é o caso normal, e o cartão não diz nada. */
  it('nenhum lado: nada a mostrar', () => {
    expect(describeDeliveryWindow({ end: null, start: null, timeZone: TIME_ZONE })).toBeUndefined()
  })
})
