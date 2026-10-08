/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 240: a tela de correção montada de verdade, com a API dublada — os contratos do formulário e
 * dos erros dividem o detalhe dublado, o clique e a digitação. Dados sintéticos.
 */
import { useQuery } from '@tanstack/react-query'
import { act, createElement } from 'react'

import { OccurrenceCorrectionActions } from '@/modules/trip/components/OccurrenceCorrectionActions.component'
import { TRIP_OCCURRENCE_FEED_QUERY_KEY } from '@/modules/trip/queries/tripOccurrenceFeed.query'
import { TRIP_MANAGE_PERMISSION } from '@/modules/trip/shared/trip.constant'
import type { OccurrenceType } from '@/modules/trip/shared/occurrenceType.types'
import type {
  CorrectTripOccurrenceItemsInput,
  OccurrenceWriteResult,
  TripDocumentProduct,
} from '@/modules/trip/shared/trip.types'
import type {
  TripOccurrenceDetail,
  TripOccurrenceDetailItem,
} from '@/modules/trip/shared/tripOccurrenceFeed.service'

import {
  buildOccurrenceDetailFixture,
  DETAIL_FIXTURE_IDS,
} from '../fixtures/tripOccurrenceDetail.fixture'
import { resetTripHookFakes, tripHookFakes as fakes } from './tripClientMocks.helper'

export const COMPANY_ID = 'company-1'
const DETAIL_KEY = [
  TRIP_OCCURRENCE_FEED_QUERY_KEY,
  'detail',
  COMPANY_ID,
  DETAIL_FIXTURE_IDS.occurrenceId,
] as const

export const PRODUCTS: readonly TripDocumentProduct[] = ['696', '697', '698'].map(
  (code, index) => ({
    code,
    commercialUnit: 'CX',
    description: `Produto ${code}`,
    ordinal: index + 1,
    quantity: '10.000',
    totalValue: '10.00',
    unitValue: '1.00',
  }),
)

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
let currentCorrections: NonNullable<TripOccurrenceDetail['corrections']> = []
let detailReadCount = 0
let detailOverrides: Partial<TripOccurrenceDetail> = {}

/** A API dublada: guarda o conjunto vigente e o devolve na próxima leitura do detalhe. */
export function installServerDouble(
  overrides: Partial<TripOccurrenceDetail> = {},
  occurrenceTypes: readonly OccurrenceType[] = [],
): {
  calls: CorrectTripOccurrenceItemsInput[]
  detailReads: () => number
} {
  const calls: CorrectTripOccurrenceItemsInput[] = []
  detailOverrides = overrides
  detailReadCount = 0
  currentItems = buildOccurrenceDetailFixture().items
  currentCorrections = []
  resetTripHookFakes([])
  fakes.tripClient = {
    ...fakes.tripClient,
    correctTripOccurrenceItems: (input) => {
      calls.push(input)
      currentCorrections = [
        ...currentCorrections,
        {
          correctedAt: '2026-10-03T10:00:00.000Z',
          correctedByName: 'Operador de teste',
          previousItems: currentItems.map(({ code, quantity, unit }) => ({ code, quantity, unit })),
        },
      ]
      currentItems = input.items.map((item) => ({
        code: item.code,
        description: `Produto ${item.code}`,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
      }))
      return Promise.resolve(WRITE_RESULT)
    },
    listOccurrenceTypes: () => Promise.resolve(occurrenceTypes),
    readTripDocumentProducts: () => Promise.resolve(PRODUCTS),
  }
  return { calls, detailReads: () => detailReadCount }
}

export function DetailHarness({
  permissions = [TRIP_MANAGE_PERMISSION],
}: Readonly<{ permissions?: readonly string[] }>) {
  const query = useQuery({
    queryFn: () => {
      detailReadCount += 1
      return Promise.resolve(
        buildOccurrenceDetailFixture({
          ...detailOverrides,
          corrections: currentCorrections,
          items: currentItems,
        }),
      )
    },
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
      companyId: COMPANY_ID,
      occurrence: query.data,
      permissions,
    }),
  )
}

export function buttonByText(text: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === text,
  )
  if (found === undefined) throw new Error(`BUTTON_NOT_FOUND:${text}`)
  return found
}

export async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click()
    await Promise.resolve()
  })
}

export async function typeQuantity(label: string, value: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
  if (input === null) throw new Error(`INPUT_NOT_FOUND:${label}`)
  const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  await act(async () => {
    valueDescriptor?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

export function listedItems(): string[] {
  return [...document.querySelectorAll('ul[aria-label="itens"] li')].map(
    (item) => item.textContent ?? '',
  )
}

/**
 * O DOM do teste devolve retângulos zerados, e o `Select` fecha na hora uma camada cujo gatilho
 * "está fora da janela" (`useFloatingLayer`). Devolve a função que desfaz o remendo.
 */
export function stubVisibleLayout(): () => void {
  const original = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect')
  const visibleRect: DOMRect = {
    bottom: 130,
    height: 30,
    left: 100,
    right: 300,
    toJSON: () => ({}),
    top: 100,
    width: 200,
    x: 100,
    y: 100,
  }
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => visibleRect,
    writable: true,
  })
  return () => {
    if (original !== undefined)
      Object.defineProperty(Element.prototype, 'getBoundingClientRect', original)
  }
}
