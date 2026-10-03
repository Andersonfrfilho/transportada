/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 235 T2.2 (RF2, CA01): o formulário de correção montado de verdade, com a API dublada. Reabre com
 * o conjunto atual, manda o conjunto inteiro e o detalhe passa a mostrar a correção. Dados sintéticos.
 */
import { useQuery } from '@tanstack/react-query'
import { act, createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { OccurrenceCorrectionActions } from '@/modules/trip/components/OccurrenceCorrectionActions.component'
import { TRIP_OCCURRENCE_FEED_QUERY_KEY } from '@/modules/trip/queries/tripOccurrenceFeed.query'
import { TRIP_MANAGE_PERMISSION } from '@/modules/trip/shared/trip.constant'
import type {
  CorrectTripOccurrenceItemsInput,
  OccurrenceWriteResult,
  TripDocumentProduct,
} from '@/modules/trip/shared/trip.types'
import type { TripOccurrenceDetailItem } from '@/modules/trip/shared/tripOccurrenceFeed.service'

import {
  buildOccurrenceDetailFixture,
  DETAIL_FIXTURE_IDS,
} from '../fixtures/tripOccurrenceDetail.fixture'
import { resetTripHookFakes, tripHookFakes as fakes } from './tripClientMocks.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'

const COMPANY_ID = 'company-1'
const DETAIL_KEY = [
  TRIP_OCCURRENCE_FEED_QUERY_KEY,
  'detail',
  COMPANY_ID,
  DETAIL_FIXTURE_IDS.occurrenceId,
] as const

const PRODUCTS: readonly TripDocumentProduct[] = ['696', '697', '698'].map((code, index) => ({
  code,
  commercialUnit: 'CX',
  description: `Produto ${code}`,
  ordinal: index + 1,
  quantity: '10.000',
  totalValue: '10.00',
  unitValue: '1.00',
}))

const WRITE_RESULT: OccurrenceWriteResult = {
  attachments: [],
  createdAt: '2026-10-01T10:00:00.000Z',
  id: DETAIL_FIXTURE_IDS.occurrenceId,
  note: '',
  occurrenceTypeId: 'type-1',
  productCode: '696',
  stage: 'separation',
  typeName: 'Item avariado',
}

/** O conjunto que a API dublada devolve na próxima leitura do detalhe. */
let currentItems: readonly TripOccurrenceDetailItem[] = []

/** A API dublada: guarda o conjunto vigente e o devolve na próxima leitura do detalhe. */
function installServerDouble(): { calls: CorrectTripOccurrenceItemsInput[] } {
  const calls: CorrectTripOccurrenceItemsInput[] = []
  currentItems = buildOccurrenceDetailFixture().items
  resetTripHookFakes([])
  fakes.tripClient = {
    ...fakes.tripClient,
    correctTripOccurrenceItems: (input) => {
      calls.push(input)
      currentItems = input.items.map((item) => ({
        code: item.code,
        description: `Produto ${item.code}`,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
      }))
      return Promise.resolve(WRITE_RESULT)
    },
    readTripDocumentProducts: () => Promise.resolve(PRODUCTS),
  }
  return { calls }
}

function DetailHarness() {
  const query = useQuery({
    queryFn: () => Promise.resolve(buildOccurrenceDetailFixture({ items: currentItems })),
    queryKey: DETAIL_KEY,
  })
  if (query.data === undefined) return null
  return createElement(
    'div',
    null,
    createElement(
      'ul',
      { 'aria-label': 'itens' },
      query.data.items.map((item) =>
        createElement('li', { key: item.code }, `${item.code}:${item.quantity ?? '-'}`),
      ),
    ),
    createElement(OccurrenceCorrectionActions, {
      occurrence: query.data,
      permissions: [TRIP_MANAGE_PERMISSION],
    }),
  )
}

function buttonByText(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === text,
  )
  if (found === undefined) throw new Error(`BUTTON_NOT_FOUND:${text}`)
  return found
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click()
    await Promise.resolve()
  })
}

async function typeQuantity(label: string, value: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
  if (input === null) throw new Error(`INPUT_NOT_FOUND:${label}`)
  const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  await act(async () => {
    valueDescriptor?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

function listedItems(): string[] {
  return [...document.querySelectorAll('ul[aria-label="itens"] li')].map(
    (item) => item.textContent ?? '',
  )
}

describe('formulário de correção da ocorrência (spec 235 T2.2, CA01)', () => {
  test('reabre com o conjunto atual, salva o conjunto inteiro e o detalhe mostra a correção', async () => {
    const { calls } = installServerDouble()
    const rendered = await renderWithQueryClient(createElement(DetailHarness))
    await waitFor(() => expect(listedItems()).toEqual(['696:3.000', '697:-']))

    await click(buttonByText('Corrigir'))
    await waitFor(() =>
      expect(document.querySelector('input[aria-label="696 — Quantidade"]')).not.toBeNull(),
    )
    const prefilled = document.querySelector<HTMLInputElement>(
      'input[aria-label="696 — Quantidade"]',
    )
    expect(prefilled?.value).toBe('3.000')
    expect(
      document.querySelector('input[aria-label="697 — Quantidade"]')?.getAttribute('value'),
    ).toBe('')

    await typeQuantity('696 — Quantidade', '4')
    await click(buttonByText('Salvar correção'))
    await settle()

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      documentId: DETAIL_FIXTURE_IDS.documentId,
      idempotencyKey: expect.any(String) as unknown as string,
      items: [{ code: '696', quantity: '4', unit: 'box' }, { code: '697' }],
      occurrenceId: DETAIL_FIXTURE_IDS.occurrenceId,
      tripId: DETAIL_FIXTURE_IDS.tripId,
    })
    await waitFor(() => expect(listedItems()).toEqual(['696:4', '697:-']))
    expect(document.querySelector('input[aria-label="696 — Quantidade"]')).toBeNull()
    rendered.unmount()
  })

  test('Descartar fecha o formulário sem chamar a API', async () => {
    const { calls } = installServerDouble()
    const rendered = await renderWithQueryClient(createElement(DetailHarness))
    await waitFor(() => expect(listedItems()).toHaveLength(2))

    await click(buttonByText('Corrigir'))
    await waitFor(() =>
      expect(document.querySelector('input[aria-label="696 — Quantidade"]')).not.toBeNull(),
    )
    await click(buttonByText('Descartar'))

    expect(document.querySelector('input[aria-label="696 — Quantidade"]')).toBeNull()
    expect(calls).toHaveLength(0)
    rendered.unmount()
  })
})
