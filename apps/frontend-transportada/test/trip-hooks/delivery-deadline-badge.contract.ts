/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T2.1 (P1, P3, RF6): o selo do prazo de entrega na linha da nota e a data no "Dados da nota". Prova
 * pelo **markup renderizado**: o texto de cada estado em pt-BR e en, o singular e o plural, "vencida" sem
 * número quando os dias de atraso são zero, nenhum selo para `null` e para API anterior, a data civil sem
 * recuo de dia, e que o selo só informa — nenhum botão some e nenhuma nota muda de lugar.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { TOOLTIP_OPEN_DELAY_MS } from '../../src/components/ui/tooltip'
import { i18n } from '../../src/modules/shared/i18n/i18n.service'
import { TripStopDocumentGroup } from '../../src/modules/trip/components/TripStopList.component'
import type {
  TripDocumentDeliveryDeadline,
  TripDocumentDetail,
} from '../../src/modules/trip/shared/trip.types'

import {
  buildDeadlineDocument,
  DEADLINE_DOCUMENTS,
  DEADLINE_DUE_ON,
} from '../fixtures/tripDeliveryDeadline.fixture'
import { buildRowActions, buildSelection } from './tripDeadlineRows.helper'
import { stubVisibleLayout } from './visibleLayout.helper'

const BADGE_SELECTOR = '[data-part="delivery-deadline"]'
const FIELD_SELECTOR = '[data-part="delivery-deadline-field"]'

type TextCase = Readonly<{
  deadline: TripDocumentDeliveryDeadline
  english: string
  portuguese: string
  state: string
  tone: string
}>

const TEXT_CASES: readonly TextCase[] = [
  {
    deadline: { businessDaysRemaining: 2, dueOn: DEADLINE_DUE_ON, state: 'on_time' },
    english: 'Due in 2 business days',
    portuguese: 'Vence em 2 dias úteis',
    state: 'on_time',
    tone: 'neutral',
  },
  {
    deadline: { businessDaysRemaining: 1, dueOn: DEADLINE_DUE_ON, state: 'on_time' },
    english: 'Due in 1 business day',
    portuguese: 'Vence em 1 dia útil',
    state: 'on_time',
    tone: 'neutral',
  },
  {
    deadline: { dueOn: DEADLINE_DUE_ON, state: 'due_today' },
    english: 'Due today',
    portuguese: 'Vence hoje',
    state: 'due_today',
    tone: 'warning',
  },
  {
    deadline: { businessDaysLate: 1, dueOn: DEADLINE_DUE_ON, state: 'overdue' },
    english: 'Overdue by 1 business day',
    portuguese: 'Vencida há 1 dia útil',
    state: 'overdue',
    tone: 'alert',
  },
  {
    deadline: { businessDaysLate: 3, dueOn: DEADLINE_DUE_ON, state: 'overdue' },
    english: 'Overdue by 3 business days',
    portuguese: 'Vencida há 3 dias úteis',
    state: 'overdue',
    tone: 'alert',
  },
  {
    deadline: { businessDaysLate: 0, dueOn: DEADLINE_DUE_ON, state: 'overdue' },
    english: 'Overdue',
    portuguese: 'Vencida',
    state: 'overdue',
    tone: 'alert',
  },
  {
    deadline: { deliveredOn: DEADLINE_DUE_ON, dueOn: DEADLINE_DUE_ON, state: 'delivered_on_time' },
    english: 'Delivered on time',
    portuguese: 'Entregue no prazo',
    state: 'delivered_on_time',
    tone: 'success',
  },
  {
    deadline: {
      businessDaysLate: 1,
      deliveredOn: '2026-10-16',
      dueOn: DEADLINE_DUE_ON,
      state: 'delivered_late',
    },
    english: 'Delivered 1 business day late',
    portuguese: 'Entregue com 1 dia útil de atraso',
    state: 'delivered_late',
    tone: 'warning',
  },
  {
    deadline: {
      businessDaysLate: 2,
      deliveredOn: '2026-10-19',
      dueOn: DEADLINE_DUE_ON,
      state: 'delivered_late',
    },
    english: 'Delivered 2 business days late',
    portuguese: 'Entregue com 2 dias úteis de atraso',
    state: 'delivered_late',
    tone: 'warning',
  },
  {
    deadline: {
      businessDaysLate: 0,
      deliveredOn: '2026-10-17',
      dueOn: DEADLINE_DUE_ON,
      state: 'delivered_late',
    },
    english: 'Delivered after the deadline',
    portuguese: 'Entregue fora do prazo',
    state: 'delivered_late',
    tone: 'warning',
  },
]

let root: Root | undefined
let container: HTMLDivElement | undefined
let restoreLayout: (() => void) | undefined

function renderRows(
  documents: readonly TripDocumentDetail[],
  options: Readonly<{ openDocumentId?: null | string }> = {},
): HTMLElement {
  const actions = buildRowActions({ openDocumentId: options.openDocumentId ?? null })
  const selection = buildSelection()
  container = window.document.createElement('div')
  window.document.body.append(container)
  root = createRoot(container)
  act(() => root?.render(createElement(TripStopDocumentGroup, { actions, documents, selection })))
  return container
}

function badgeOf(dom: HTMLElement): HTMLElement {
  const badge = dom.querySelector<HTMLElement>(BADGE_SELECTOR)
  if (badge === null) throw new Error('DEADLINE_BADGE_NOT_FOUND')
  return badge
}

function labelOf(badge: HTMLElement): string {
  return badge.querySelector('[data-part="delivery-deadline-label"]')?.textContent ?? ''
}

describe('o selo do prazo de entrega da nota (spec 236)', () => {
  beforeEach(() => {
    restoreLayout = stubVisibleLayout()
  })

  afterEach(async () => {
    if (root !== undefined) act(() => root?.unmount())
    container?.remove()
    root = undefined
    container = undefined
    await i18n.changeLanguage('pt-BR')
    restoreLayout?.()
  })

  describe('o texto do selo de cada estado (spec 236 P1)', () => {
    for (const textCase of TEXT_CASES) {
      const document = buildDeadlineDocument({
        deadline: textCase.deadline,
        id: 'doc-1',
        number: '1',
      })

      it(`pt-BR, ${textCase.portuguese}: texto, estado e tom`, () => {
        const badge = badgeOf(renderRows([document]))

        expect(labelOf(badge)).toBe(textCase.portuguese)
        expect(badge.dataset['state']).toBe(textCase.state)
        expect(badge.dataset['tone']).toBe(textCase.tone)
      })

      it(`en, ${textCase.english}`, async () => {
        await i18n.changeLanguage('en')

        expect(labelOf(badgeOf(renderRows([document])))).toBe(textCase.english)
      })
    }

    it('vencida com zero dia útil diz só "vencida": nenhum número aparece no selo', () => {
      const badge = badgeOf(
        renderRows([
          buildDeadlineDocument({
            deadline: { businessDaysLate: 0, dueOn: DEADLINE_DUE_ON, state: 'overdue' },
            id: 'doc-1',
            number: '1',
          }),
        ]),
      )

      expect(labelOf(badge)).not.toMatch(/\d/u)
    })
  })

  describe('a data do vencimento fica ao alcance de quem lê e de quem ouve (spec 236 RF6)', () => {
    it('o selo leva a data por extenso para o leitor de tela, sem depender da cor nem do ponteiro', () => {
      const badge = badgeOf(
        renderRows([
          buildDeadlineDocument({
            deadline: { businessDaysLate: 1, dueOn: DEADLINE_DUE_ON, state: 'overdue' },
            id: 'doc-1',
            number: '1',
          }),
        ]),
      )

      expect(badge.querySelector('[data-part="delivery-deadline-date"]')?.textContent).toContain(
        '15/10/2026',
      )
    })

    it('em en a data vem na ordem do idioma', async () => {
      await i18n.changeLanguage('en')
      const badge = badgeOf(
        renderRows([
          buildDeadlineDocument({
            deadline: { dueOn: DEADLINE_DUE_ON, state: 'due_today' },
            id: 'doc-1',
            number: '1',
          }),
        ]),
      )

      expect(badge.querySelector('[data-part="delivery-deadline-date"]')?.textContent).toContain(
        '10/15/2026',
      )
    })

    it('a dica do design system abre com a data ao apontar o selo', async () => {
      const badge = badgeOf(renderRows([DEADLINE_DOCUMENTS[0] as TripDocumentDetail]))

      await act(async () => {
        badge.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
        await new Promise((resolve) => setTimeout(resolve, TOOLTIP_OPEN_DELAY_MS + 50))
      })
      const layers = [...window.document.body.children].filter(
        (child) => child.textContent === 'Prazo de entrega até 15/10/2026',
      )
      await act(async () => {
        badge.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
        await Promise.resolve()
      })

      expect(layers.length).toBe(1)
    })

    it('o selo não usa o title nativo: a dica é a do design system', () => {
      const dom = renderRows([DEADLINE_DOCUMENTS[0] as TripDocumentDetail])

      expect(
        dom.querySelectorAll(`${BADGE_SELECTOR}[title], ${BADGE_SELECTOR} [title]`).length,
      ).toBe(0)
    })

    it('a nota aberta mostra o prazo de entrega com a data, no "Dados da nota"', () => {
      const dom = renderRows([DEADLINE_DOCUMENTS[0] as TripDocumentDetail], {
        openDocumentId: 'doc-overdue',
      })
      const field = dom.querySelector<HTMLElement>(FIELD_SELECTOR)

      expect(field?.textContent).toContain('Prazo de entrega')
      expect(field?.textContent).toContain('15/10/2026')
    })

    it('a nota aberta sem prazo não ganha o campo', () => {
      const dom = renderRows([DEADLINE_DOCUMENTS[5] as TripDocumentDetail], {
        openDocumentId: 'doc-null',
      })

      expect(dom.querySelectorAll(FIELD_SELECTOR).length).toBe(0)
    })
  })

  describe('nota sem prazo (spec 236 P3)', () => {
    it('prazo nulo não ganha selo', () => {
      expect(
        renderRows([DEADLINE_DOCUMENTS[5] as TripDocumentDetail]).querySelectorAll(BADGE_SELECTOR)
          .length,
      ).toBe(0)
    })

    it('API anterior, sem o campo, não ganha selo e a linha continua inteira', () => {
      const dom = renderRows([DEADLINE_DOCUMENTS[6] as TripDocumentDetail])

      expect(dom.querySelectorAll(BADGE_SELECTOR).length).toBe(0)
      expect(dom.textContent).toContain('1007')
    })
  })

  describe('o selo só informa (spec 236 D3)', () => {
    function withoutBadge(dom: HTMLElement): string {
      const clone = dom.cloneNode(true) as HTMLElement
      for (const badge of clone.querySelectorAll(BADGE_SELECTOR)) {
        const slot = badge.parentElement
        if (slot !== null && slot !== clone) slot.remove()
      }
      return normalizeGeneratedIds(clone.innerHTML)
    }

    /** O `useId` do React é um contador do processo: duas montagens do mesmo markup não repetem o id. */
    function normalizeGeneratedIds(markup: string): string {
      return markup.replace(/(_r_[0-9a-z]+_|:r[0-9a-z]+:|«r[0-9a-z]+»)/gu, 'ID')
    }

    function withoutDeadlineField(document: TripDocumentDetail): TripDocumentDetail {
      return Object.fromEntries(
        Object.entries(document).filter(([key]) => key !== 'deliveryDeadline'),
      ) as unknown as TripDocumentDetail
    }

    it('a mesma nota, com e sem prazo, tem a mesma linha fora o selo: botões, ordem e textos', () => {
      for (const deadlineDocument of DEADLINE_DOCUMENTS.slice(0, 5)) {
        const withDeadline = renderRows([deadlineDocument])
        const withDeadlineHtml = withoutBadge(withDeadline)
        act(() => root?.unmount())
        withDeadline.remove()
        root = undefined
        const without = renderRows([withoutDeadlineField(deadlineDocument)])

        expect(withDeadlineHtml).toBe(normalizeGeneratedIds(without.innerHTML))
        act(() => root?.unmount())
        without.remove()
        root = undefined
      }
    })

    it('a ordem das notas é a recebida, qualquer que seja o prazo', () => {
      const shuffled = [
        DEADLINE_DOCUMENTS[4],
        DEADLINE_DOCUMENTS[0],
        DEADLINE_DOCUMENTS[6],
        DEADLINE_DOCUMENTS[2],
      ] as TripDocumentDetail[]
      const dom = renderRows(shuffled)
      const text = dom.textContent ?? ''

      expect(dom.querySelectorAll('li[id]').length).toBe(4)
      const positions = ['1005', '1001', '1007', '1003'].map((number) => text.indexOf(number))

      expect(positions.every((position) => position >= 0)).toBe(true)
      expect(positions).toEqual([...positions].sort((left, right) => left - right))
    })

    it('o selo não é botão nem foco: não vira ação', () => {
      const badge = badgeOf(renderRows([DEADLINE_DOCUMENTS[0] as TripDocumentDetail]))

      expect(badge.closest('button')).toBeNull()
      expect(badge.querySelectorAll('button, a, [tabindex]').length).toBe(0)
    })
  })
})
