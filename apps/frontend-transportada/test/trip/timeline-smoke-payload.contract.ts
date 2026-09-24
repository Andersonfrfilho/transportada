/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'
import { FIRST_PAGE_ITEMS, SECOND_PAGE_ITEMS } from '../trip-timeline-smoke.helper'

/**
 * ⚠️ O guard da linha do tempo exige **chaves exatas**: um campo novo no contrato (`closeReason`,
 * 2026-09-21) recusa todo item do mock do smoke, a seção renderiza vazia e quem descobre é o
 * Playwright, quatro minutos depois — reprovando o gate e travando **todo** deploy para staging até
 * alguém ler o log. Aqui a mesma divergência falha em milissegundos, dizendo qual campo falta.
 */
describe('o mock da linha do tempo do smoke satisfaz o guard real', () => {
  const adapters = createTripResponseAdapters()

  for (const [pageName, items] of [
    ['primeira página', FIRST_PAGE_ITEMS],
    ['segunda página', SECOND_PAGE_ITEMS],
  ] as const) {
    it(`aceita os itens da ${pageName}`, () => {
      const parsed = adapters.tripTimelineFromApi({ items, nextCursor: null })

      expect(parsed.items).toHaveLength(items.length)
    })
  }
})
