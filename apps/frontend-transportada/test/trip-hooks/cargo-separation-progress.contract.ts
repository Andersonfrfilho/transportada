/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4b: no celular, a chegada com 9 notas separadas e 1 devolvida ao contratante nunca chegava a 100%
 * (a devolvida seguia no total). A barra e o texto contam só as notas que ainda se separam, e a contagem das
 * notas a devolver/devolvidas aparece ao lado — o grupo diz "9 de 9" e quantas estão em devolução.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { buildDocument, documentIdOf } from '../fixtures/cargoReceiving.fixture'
import { mountSeparation, stubVisibleLayout, text } from './cargoOccurrenceScreen.helper'

const separated = (number: number) =>
  buildDocument({
    number: String(number),
    receivedAt: '2026-10-03T13:00:00.000Z',
    separatedAt: '2026-10-03T13:30:00.000Z',
    separationState: 'separated',
  })

const NINE_SEPARATED = Array.from({ length: 9 }, (_, index) => separated(2001 + index))
const RETURNED = buildDocument({
  number: '2010',
  receivedAt: '2026-10-03T13:00:00.000Z',
  separationState: 'received',
})
const DOCUMENTS = [...NINE_SEPARATED, RETURNED]

let restoreLayout: () => void = () => undefined

beforeEach(() => {
  document.body.innerHTML = ''
  restoreLayout = stubVisibleLayout()
})

afterEach(() => restoreLayout())

const bar = (): HTMLElement => document.querySelector('[role="progressbar"]') as HTMLElement

describe('o progresso da separação no celular', () => {
  test('9 separadas e 1 devolvida leem como completo: 100%, "9 de 9" e a devolvida ao lado', async () => {
    const { rendered } = await mountSeparation({
      arrival: { documents: DOCUMENTS },
      occurrence: {
        returns: new Map([
          [documentIdOf(2010), { occurrenceId: 'occ-1', state: 'returned' as const }],
        ]),
      },
    })

    expect(bar().getAttribute('aria-valuenow')).toBe('100')
    expect(bar().getAttribute('aria-valuetext')).toBe('9 de 9 separadas')
    expect(text()).toContain('Notas devolvidas: 1')
    rendered.unmount()
  })

  test('a nota a devolver (marcada) também sai da conta e aparece como "a devolver"', async () => {
    const { rendered } = await mountSeparation({
      arrival: { documents: DOCUMENTS },
      occurrence: {
        returns: new Map([
          [documentIdOf(2010), { occurrenceId: 'occ-1', state: 'marked' as const }],
        ]),
      },
    })

    expect(bar().getAttribute('aria-valuetext')).toBe('9 de 9 separadas')
    expect(text()).toContain('Notas a devolver: 1')
    rendered.unmount()
  })

  test('o grupo diz "9 de 9" e quantas notas estão em devolução', async () => {
    const { rendered } = await mountSeparation({
      arrival: { documents: DOCUMENTS },
      occurrence: {
        returns: new Map([
          [documentIdOf(2010), { occurrenceId: 'occ-1', state: 'returned' as const }],
        ]),
      },
    })

    const toggle = document.querySelector('[aria-expanded]') as HTMLElement
    expect(toggle.textContent).toContain('9 de 9')
    expect(toggle.textContent).toContain('1 em devolução')
    rendered.unmount()
  })

  test('sem devolução nada muda: 9 de 10 e nenhum aviso de devolução', async () => {
    const { rendered } = await mountSeparation({ arrival: { documents: DOCUMENTS } })

    expect(bar().getAttribute('aria-valuetext')).toBe('9 de 10 separadas')
    expect(text()).not.toContain('em devolução')
    expect(text()).not.toContain('Notas devolvidas')
    rendered.unmount()
  })
})
