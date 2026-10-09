/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T5.3 (ADR-0100 §6, CA14): o aviso de feriado em duas telas. Na montagem é uma linha de texto neutro dentro
 * da parada; no detalhe da viagem é um selo na parada, com o texto inteiro para o leitor de tela. Só informa: nenhum
 * botão some e a lista de paradas não muda. Dados sintéticos.
 */
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { i18n } from '../../src/modules/shared/i18n/i18n.service'
import { AssemblyStopHolidayNotice } from '../../src/modules/trip/components/AssemblyStopHolidayNotice.component'
import { TripStopList } from '../../src/modules/trip/components/TripStopList.component'
import type { HolidayWarning } from '../../src/modules/trip/shared/trip.types'

import { buildDeadlineDocument, buildDeadlineStop } from '../fixtures/tripDeliveryDeadline.fixture'

import { renderWithQueryClient } from './renderHook.helper'
import { buildRowActions, buildSelection } from './tripDeadlineRows.helper'
import { stubVisibleLayout } from './visibleLayout.helper'

const BADGE = '[data-part="holiday-warning"]'
const SENTENCE_PT =
  'Entrega prevista em 13/10/2026 em Campinas/SP: feriado municipal — Aniversário da cidade (importado). Confira se o cliente recebe.'

const warning: HolidayWarning = {
  cityIbgeCode: 3509502,
  date: '2026-10-13',
  reasons: [{ name: 'Aniversário da cidade', origin: 'imported', scope: 'municipal' }],
}

let restoreLayout: (() => void) | undefined

function stopsWith(warnings: readonly HolidayWarning[] | undefined) {
  const withWarning = buildDeadlineStop({
    documents: [buildDeadlineDocument({ id: 'doc-1', number: '1001' })],
    id: 'stop-a',
    sequence: 1,
  })
  const plain = buildDeadlineStop({
    documents: [buildDeadlineDocument({ id: 'doc-2', number: '1002' })],
    id: 'stop-b',
    sequence: 2,
  })
  return [warnings === undefined ? withWarning : { ...withWarning, holidayWarnings: warnings }, plain]
}

function renderStops(warnings: readonly HolidayWarning[] | undefined) {
  return renderWithQueryClient(
    createElement(TripStopList, {
      actions: buildRowActions(),
      canReorder: false,
      onReorder: () => undefined,
      selection: buildSelection(),
      stops: stopsWith(warnings),
    }),
  )
}

function badges(): readonly HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(BADGE)]
}

describe('aviso de feriado na montagem e no detalhe (spec 252 T5.3)', () => {
  beforeEach(() => {
    restoreLayout = stubVisibleLayout()
  })

  afterEach(async () => {
    await i18n.changeLanguage('pt-BR')
    restoreLayout?.()
  })

  describe('a linha da parada na montagem', () => {
    it('diz a frase neutra com cidade, escopo, nome e origem, e pede conferência', async () => {
      await renderWithQueryClient(
        createElement(AssemblyStopHolidayNotice, { placeLabel: 'Campinas/SP', warning }),
      )

      expect(document.body.textContent).toContain(SENTENCE_PT)
    })

    it('é texto de leitura: sem botão, sem alerta que interrompe, sem bloqueio', async () => {
      await renderWithQueryClient(
        createElement(AssemblyStopHolidayNotice, { placeLabel: 'Campinas/SP', warning }),
      )

      expect(document.querySelectorAll('button, input, a').length).toBe(0)
      expect(document.querySelector('[role="alert"]')).toBeNull()
      expect(document.querySelector('p[data-part="holiday-warning-notice"]')).not.toBeNull()
    })

    it('em inglês', async () => {
      await i18n.changeLanguage('en')
      await renderWithQueryClient(
        createElement(AssemblyStopHolidayNotice, { placeLabel: 'Campinas/SP', warning }),
      )

      expect(document.body.textContent).toContain('Expected delivery on 10/13/2026 in Campinas/SP')
    })
  })

  describe('o selo na parada do detalhe da viagem', () => {
    it('aparece só na parada que tem aviso, com a data no selo e a frase inteira para o leitor de tela', async () => {
      await renderStops([warning])

      expect(badges()).toHaveLength(1)
      const [badge] = badges()
      expect(badge?.closest('li[id^="trip-timeline-stop-"]')?.textContent).toContain('Parada 1')
      expect(
        badge?.querySelector('[data-part="holiday-warning-label"]')?.textContent,
      ).toBe('Feriado em 13/10/2026')
      expect(badge?.querySelector('[data-part="holiday-warning-text"]')?.textContent).toContain(
        'Entrega prevista em 13/10/2026: feriado municipal — Aniversário da cidade (importado)',
      )
      expect(badge?.dataset['tone']).toBe('warning')
    })

    it('API anterior (campo ausente) e lista vazia não mostram selo nenhum', async () => {
      await renderStops(undefined)
      expect(badges()).toHaveLength(0)
    })

    it('lista vazia não mostra selo', async () => {
      await renderStops([])
      expect(badges()).toHaveLength(0)
    })

    it('usa o nome da cidade que a API mandou, quando há', async () => {
      await renderStops([{ ...warning, cityName: 'Campinas' }])

      expect(badges()[0]?.textContent).toContain('em Campinas:')
    })

    it('só informa: os botões e as paradas ficam exatamente como sem o aviso', async () => {
      const plain = await renderStops(undefined)
      const before = [...document.querySelectorAll('button')].map((button) => button.textContent)
      const stopsBefore = [...document.querySelectorAll('li[id^="trip-timeline-stop-"]')].map(
        (item) => item.id,
      )
      plain.unmount()

      await renderStops([warning])

      const after = [...document.querySelectorAll('button')].map((button) => button.textContent)
      expect(after).toEqual(before)
      expect(
        [...document.querySelectorAll('li[id^="trip-timeline-stop-"]')].map((item) => item.id),
      ).toEqual(stopsBefore)
      expect(badges()[0]?.getAttribute('role')).toBeNull()
    })

    it('em inglês o selo e a frase também', async () => {
      await i18n.changeLanguage('en')
      await renderStops([warning])

      expect(
        badges()[0]?.querySelector('[data-part="holiday-warning-label"]')?.textContent,
      ).toBe('Holiday on 10/13/2026')
    })
  })
})
