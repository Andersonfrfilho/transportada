/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T2.1 (P2, RF6): o filtro "vencidas / vencem hoje" na lista de notas do detalhe da viagem. Prova
 * pelo comportamento montado: a seleção é múltipla, mora na URL (escrita no próprio gesto, com o resto da
 * URL intacto), o "limpar filtros" só existe com filtro ativo, a lista filtrada mantém todas as paradas na
 * ordem recebida e a nota escondida não entra no "marcar todas".
 */
import { act, createElement, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { i18n } from '../../src/modules/shared/i18n/i18n.service'
import { TripDeliveryDeadlineFilter } from '../../src/modules/trip/components/TripDeliveryDeadlineFilter.component'
import { TripStopList } from '../../src/modules/trip/components/TripStopList.component'
import {
  useTripDeliveryDeadlineScope,
  type TripDeliveryDeadlineScope,
} from '../../src/modules/trip/hooks/useTripDeliveryDeadlineScope.hook'
import type { TripDocumentDetail } from '../../src/modules/trip/shared/trip.types'

import {
  buildDeadlineDocument,
  buildDeadlineStop,
  DEADLINE_DOCUMENTS,
} from '../fixtures/tripDeliveryDeadline.fixture'
import { click, resetLocation } from './cargoReceivingHarness.helper'
import { renderHook, renderWithQueryClient, settle } from './renderHook.helper'
import { buildRowActions, buildSelection } from './tripDeadlineRows.helper'
import { stubVisibleLayout } from './visibleLayout.helper'

const TRIP_PATH = '/trips/trip-1'
const TRIGGER_LABEL = 'Prazo de entrega'
const CLEAR_LABEL = 'Limpar filtros'
const EMPTY_STOP_TEXT = 'Nenhuma nota desta parada corresponde ao filtro.'

let restoreLayout: (() => void) | undefined

function triggerOf(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`button[aria-label="${TRIGGER_LABEL}"]`)
}

function clearButtonOf(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === CLEAR_LABEL,
  )
}

function optionLabels(): readonly string[] {
  return [...document.querySelectorAll('[role="option"]')].map(
    (option) => option.textContent?.trim() ?? '',
  )
}

async function pickOption(label: string): Promise<void> {
  const option = [...document.querySelectorAll('[role="option"]')].find((candidate) =>
    candidate.textContent?.trim().startsWith(label),
  )
  if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${label}`)
  await click(option as HTMLElement)
}

describe('o filtro do prazo de entrega no detalhe da viagem (spec 236)', () => {
  beforeEach(() => {
    restoreLayout = stubVisibleLayout()
    resetLocation(TRIP_PATH)
  })

  afterEach(() => {
    restoreLayout?.()
    resetLocation('/')
  })

  describe('o estado do filtro na URL (spec 236 P2)', () => {
    it('sem parâmetro, nada é filtrado e as contagens fecham com o total', async () => {
      const rendered = await renderHook(() => useTripDeliveryDeadlineScope(DEADLINE_DOCUMENTS))
      const scope = rendered.result()

      expect(scope.visibleDocumentIds).toBeUndefined()
      expect(scope.hasFilter).toBe(false)
      expect(scope.totalCount).toBe(7)
      expect(scope.shownCount).toBe(7)
      expect(scope.counts).toEqual({ delivered: 2, due_today: 1, none: 2, on_time: 1, overdue: 1 })
    })

    it('o gesto escreve na URL e preserva o resto dela, inclusive o hash', async () => {
      resetLocation(`${TRIP_PATH}?tab=notas#nota-1`)
      const rendered = await renderHook(() => useTripDeliveryDeadlineScope(DEADLINE_DOCUMENTS))

      act(() => rendered.result().filter.setValues(['due_today', 'overdue']))

      expect(window.location.pathname).toBe(TRIP_PATH)
      expect(window.location.search).toBe('?tab=notas&deadline=overdue%2Cdue_today')
      expect(window.location.hash).toBe('#nota-1')
      expect(rendered.result().filter.values).toEqual(['overdue', 'due_today'])
      expect([...(rendered.result().visibleDocumentIds ?? [])].sort()).toEqual([
        'doc-overdue',
        'doc-today',
      ])
      expect(rendered.result().shownCount).toBe(2)
    })

    it('a URL de entrada já abre filtrada, com "Sem prazo" pegando prazo nulo e API anterior', async () => {
      resetLocation(`${TRIP_PATH}?deadline=none`)
      const rendered = await renderHook(() => useTripDeliveryDeadlineScope(DEADLINE_DOCUMENTS))

      expect([...(rendered.result().visibleDocumentIds ?? [])].sort()).toEqual([
        'doc-legacy',
        'doc-null',
      ])
    })

    it('limpar tira o parâmetro e devolve todas as notas', async () => {
      resetLocation(`${TRIP_PATH}?tab=notas&deadline=overdue`)
      const rendered = await renderHook(() => useTripDeliveryDeadlineScope(DEADLINE_DOCUMENTS))

      act(() => rendered.result().filter.clear())

      expect(window.location.search).toBe('?tab=notas')
      expect(rendered.result().visibleDocumentIds).toBeUndefined()
      expect(rendered.result().shownCount).toBe(7)
    })

    it('voltar no navegador relê o filtro da URL', async () => {
      const rendered = await renderHook(() => useTripDeliveryDeadlineScope(DEADLINE_DOCUMENTS))

      act(() => {
        resetLocation(`${TRIP_PATH}?deadline=overdue`)
        window.dispatchEvent(new PopStateEvent('popstate'))
      })

      expect(rendered.result().filter.values).toEqual(['overdue'])
      expect(rendered.result().shownCount).toBe(1)
    })

    it('só é oferecido quando alguma nota tem prazo', async () => {
      const withDeadline = await renderHook(() => useTripDeliveryDeadlineScope(DEADLINE_DOCUMENTS))
      const withoutDeadline = await renderHook(() =>
        useTripDeliveryDeadlineScope([
          buildDeadlineDocument({ deadline: null, id: 'a', number: '1' }),
          buildDeadlineDocument({ id: 'b', number: '2' }),
        ]),
      )

      expect(withDeadline.result().isOffered).toBe(true)
      expect(withoutDeadline.result().isOffered).toBe(false)
    })
  })

  function FilterHarness({ documents }: Readonly<{ documents: readonly TripDocumentDetail[] }>) {
    const scope: TripDeliveryDeadlineScope = useTripDeliveryDeadlineScope(documents)
    return createElement(TripDeliveryDeadlineFilter, { scope })
  }

  async function mountFilter(documents: readonly TripDocumentDetail[]) {
    return renderWithQueryClient(createElement(FilterHarness, { documents }))
  }

  describe('o seletor do filtro (spec 236 P2)', () => {
    it('oferece as cinco opções, cada uma com a sua contagem', async () => {
      await mountFilter(DEADLINE_DOCUMENTS)

      await click(triggerOf() as HTMLButtonElement)

      expect(optionLabels().map((label) => label.replace(/\s+/gu, ' '))).toEqual([
        'Vencidas (1)',
        'Vencem hoje (1)',
        'No prazo (1)',
        'Entregues (2)',
        'Sem prazo (2)',
      ])
    })

    it('é de seleção múltipla: duas opções somam, e a URL leva as duas', async () => {
      await mountFilter(DEADLINE_DOCUMENTS)

      await click(triggerOf() as HTMLButtonElement)
      await pickOption('Vencidas')
      await pickOption('Vencem hoje')

      expect(window.location.search).toBe('?deadline=overdue%2Cdue_today')
      expect(document.body.textContent).toContain('2 de 7 notas')
    })

    it('"limpar filtros" só existe com filtro ativo e limpa a URL', async () => {
      await mountFilter(DEADLINE_DOCUMENTS)
      expect(clearButtonOf()).toBeUndefined()

      await click(triggerOf() as HTMLButtonElement)
      await pickOption('Vencidas')

      const clear = clearButtonOf()
      expect(clear).toBeDefined()

      await click(clear as HTMLButtonElement)

      expect(window.location.search).toBe('')
      expect(clearButtonOf()).toBeUndefined()
      expect(document.body.textContent).not.toContain('de 7 notas')
    })

    it('o gatilho tem alvo de toque e nome acessível', async () => {
      await mountFilter(DEADLINE_DOCUMENTS)

      expect(triggerOf()?.getAttribute('aria-label')).toBe(TRIGGER_LABEL)
    })

    it('em en, os rótulos saem do mesmo bloco', async () => {
      await i18n.changeLanguage('en')
      const rendered = await mountFilter(DEADLINE_DOCUMENTS)
      try {
        const trigger = document.querySelector<HTMLButtonElement>(
          'button[aria-label="Delivery deadline"]',
        )
        await click(trigger as HTMLButtonElement)

        expect(optionLabels().map((label) => label.replace(/\s+/gu, ' '))).toEqual([
          'Overdue (1)',
          'Due today (1)',
          'On time (1)',
          'Delivered (2)',
          'No deadline (2)',
        ])
      } finally {
        rendered.unmount()
        await i18n.changeLanguage('pt-BR')
      }
    })

    it('viagem sem nota com prazo não ganha o filtro', async () => {
      await mountFilter([
        buildDeadlineDocument({ deadline: null, id: 'a', number: '1' }),
        buildDeadlineDocument({ id: 'b', number: '2' }),
      ])
      await settle()

      expect(triggerOf()).toBeNull()
    })
  })

  function buildStops() {
    const [overdue, today, onTime, delivered, deliveredLate, nullDeadline, legacy] =
      DEADLINE_DOCUMENTS as readonly [
        TripDocumentDetail,
        TripDocumentDetail,
        TripDocumentDetail,
        TripDocumentDetail,
        TripDocumentDetail,
        TripDocumentDetail,
        TripDocumentDetail,
      ]
    return [
      buildDeadlineStop({ documents: [overdue, onTime], id: 'stop-a', sequence: 1 }),
      buildDeadlineStop({ documents: [delivered, deliveredLate], id: 'stop-b', sequence: 2 }),
      buildDeadlineStop({ documents: [today, nullDeadline, legacy], id: 'stop-c', sequence: 3 }),
    ]
  }

  function stopList(visibleDocumentIds: ReadonlySet<string> | undefined): ReactElement {
    return createElement(TripStopList, {
      actions: buildRowActions(),
      canReorder: false,
      onReorder: () => undefined,
      selection: buildSelection(),
      stops: buildStops(),
      ...(visibleDocumentIds === undefined ? {} : { visibleDocumentIds }),
    })
  }

  function rowNumbers(): readonly string[] {
    return [...document.querySelectorAll('li[id^="trip-timeline-document-"]')].map(
      (row) => /\d{4}/u.exec(row.textContent ?? '')?.[0] ?? '',
    )
  }

  function stopTitles(): readonly string[] {
    return [...document.querySelectorAll('li[id^="trip-timeline-stop-"]')].map(
      (card) => /Parada \d/u.exec(card.textContent ?? '')?.[0] ?? '',
    )
  }

  describe('a lista de paradas filtrada (spec 236 P2)', () => {
    it('sem filtro mostra todas as notas', async () => {
      await renderWithQueryClient(stopList(undefined))

      expect(rowNumbers()).toEqual(['1001', '1003', '1004', '1005', '1002', '1006', '1007'])
    })

    it('com filtro mostra só as notas escolhidas, e as paradas seguem todas, na mesma ordem', async () => {
      await renderWithQueryClient(stopList(new Set(['doc-overdue', 'doc-today'])))

      expect(rowNumbers()).toEqual(['1001', '1002'])
      expect(stopTitles()).toEqual(['Parada 1', 'Parada 2', 'Parada 3'])
    })

    it('a parada sem nota no filtro diz isso, em vez de sumir', async () => {
      await renderWithQueryClient(stopList(new Set(['doc-overdue'])))

      const cards = [...document.querySelectorAll('li[id^="trip-timeline-stop-"]')]
      expect(cards[0]?.textContent).not.toContain(EMPTY_STOP_TEXT)
      expect(cards[1]?.textContent).toContain(EMPTY_STOP_TEXT)
      expect(cards[2]?.textContent).toContain(EMPTY_STOP_TEXT)
    })

    it('o contador da parada diz quantas das notas dela aparecem', async () => {
      await renderWithQueryClient(stopList(new Set(['doc-overdue'])))

      const first = document.querySelector('li[id^="trip-timeline-stop-"]')
      expect(first?.textContent).toContain('1 de 2 notas')
    })

    it('o filtro não tira nenhuma ação da nota que continua à mostra', async () => {
      const buttonsOfFirstRow = (): readonly (string | undefined)[] =>
        [
          ...(document
            .querySelector('li[id^="trip-timeline-document-"]')
            ?.querySelectorAll('button') ?? []),
        ].map((button) => button.textContent?.trim())

      const unfiltered = await renderWithQueryClient(stopList(undefined))
      const unfilteredButtons = buttonsOfFirstRow()
      unfiltered.unmount()

      await renderWithQueryClient(stopList(new Set(['doc-overdue'])))

      expect(unfilteredButtons.length).toBeGreaterThan(0)
      expect(buttonsOfFirstRow()).toEqual(unfilteredButtons)
    })
  })
})
