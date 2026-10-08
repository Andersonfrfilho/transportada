/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T5.4 (RF12, D11): o acerto da tratativa (164) sugere o valor de cada item a partir do registro, e
 * o operador confirma. O pago digitado vence a soma da linha; o pago zero não gera sugestão ("a loja não
 * pagou, sem valor a acertar") e **nunca** é preenchido com 0; a soma da linha segue visível como referência.
 * Nenhuma regra da 164 muda. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceSettlementPanel } from '@/modules/trip/components/OccurrenceSettlementPanel.component'
import type { TripDocumentProduct } from '@/modules/trip/shared/trip.types'
import type {
  TripOccurrenceDetailItem,
  TripOccurrenceItemValue,
} from '@/modules/trip/shared/tripOccurrenceFeed.service'

import { click } from './occurrenceCorrectionHarness.helper'
import {
  installSettlementDouble,
  resetSettlementDouble,
  settlementFakes,
} from './occurrenceSettlementHarness.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'
import { resetTripHookFakes, tripHookFakes } from './tripClientMocks.helper'

const SOURCE = { documentId: 'doc-1', tripId: 'trip-1' } as const

const PRODUCTS: readonly TripDocumentProduct[] = [
  {
    code: '696',
    commercialUnit: 'CX',
    description: 'Ovos',
    ordinal: 1,
    quantity: '10.000',
    totalValue: '572.00',
    unitValue: '57.2000',
  },
  {
    code: '697',
    commercialUnit: 'CX',
    description: 'Leite',
    ordinal: 2,
    quantity: '10.000',
    totalValue: '200.00',
    unitValue: '20.0000',
  },
  {
    code: '698',
    commercialUnit: 'CX',
    description: 'Arroz',
    ordinal: 3,
    quantity: '10.000',
    totalValue: '100.00',
    unitValue: '10.0000',
  },
]

const ITEMS: readonly TripOccurrenceDetailItem[] = [
  { code: '696', description: 'Ovos', quantity: '1.000', unit: 'CX' },
  { code: '697', declaredAmount: '0.0000', description: 'Leite', quantity: '3.000', unit: 'CX' },
  { code: '698', declaredAmount: '10.5000', description: 'Arroz', quantity: '2.000', unit: 'CX' },
]

const mounted: { unmount: () => void }[] = []

function scenario(body: () => Promise<void>): () => Promise<void> {
  return async () => {
    resetTripHookFakes([])
    tripHookFakes.tripClient = {
      ...tripHookFakes.tripClient,
      readTripDocumentProducts: () => Promise.resolve(PRODUCTS),
    }
    try {
      await body()
    } finally {
      for (const rendered of mounted.splice(0)) rendered.unmount()
      resetSettlementDouble()
    }
  }
}

type RecordedValues = Readonly<{
  declaredAmount?: null | string
  itemValues?: readonly TripOccurrenceItemValue[]
}>

async function mount(
  items: readonly TripOccurrenceDetailItem[] = ITEMS,
  withSource = true,
  recorded: RecordedValues = {},
) {
  mounted.push(
    await renderWithQueryClient(
      createElement(OccurrenceSettlementPanel, {
        canResolve: true,
        occurrenceId: 'occurrence-1',
        ...(withSource ? { suggestionSource: { ...SOURCE, items, ...recorded } } : {}),
      }),
    ),
  )
  await waitFor(() => expect(document.querySelector('h4')).not.toBeNull())
}

function pageText(): string {
  return document.body.textContent ?? ''
}

function button(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === text,
  )
}

function amountInputs(): string[] {
  return [...document.querySelectorAll<HTMLInputElement>('input[aria-label="Valor"]')].map(
    (input) => input.value,
  )
}

describe('o acerto sugere o valor a partir do registro (spec 247 RF12)', () => {
  test(
    'lista a sugestão de cada item, com a soma da linha como referência, e a loja que não pagou à parte',
    scenario(async () => {
      installSettlementDouble()
      await mount()
      await waitFor(() => expect(pageText()).toContain('Sugestão pelo registro'))

      expect(pageText()).toContain('696')
      expect(pageText()).toContain('R$ 57,20')
      expect(pageText()).toContain('698')
      expect(pageText()).toContain('R$ 10,50')
      expect(pageText()).toContain('soma da linha R$ 20,00')
      expect(pageText()).toContain('A loja não pagou, sem valor a acertar')
      expect(pageText()).toContain('697')
      expect(pageText()).toContain('soma da linha R$ 60,00')
    }),
  )

  test(
    'nada é preenchido sozinho; "Usar a sugestão" preenche as linhas sem nenhuma com zero',
    scenario(async () => {
      installSettlementDouble()
      await mount()
      await waitFor(() => expect(button('Usar a sugestão do registro')).toBeDefined())
      expect(amountInputs()).toEqual([''])

      await click(button('Usar a sugestão do registro') as HTMLElement)
      expect(amountInputs()).toEqual(['57,20', '10,50'])
      expect(amountInputs()).not.toContain('0,00')
    }),
  )

  test(
    'ao salvar, cada linha leva a origem: nota para a soma, manual para o pago digitado; a loja que não pagou fica de fora',
    scenario(async () => {
      installSettlementDouble()
      await mount()
      await waitFor(() => expect(button('Usar a sugestão do registro')).toBeDefined())
      await click(button('Usar a sugestão do registro') as HTMLElement)
      await click(button('Salvar acerto') as HTMLElement)
      await settle()

      expect(settlementFakes.recorded).toHaveLength(1)
      expect(settlementFakes.recorded[0]).toEqual([
        { amount: '57.20', amountSource: 'nfe', payerKind: 'driver', productCode: '696' },
        { amount: '10.50', amountSource: 'manual', payerKind: 'driver', productCode: '698' },
      ])
    }),
  )

  test(
    'o operador que corrige o valor sugerido da nota passa a ser origem manual',
    scenario(async () => {
      installSettlementDouble()
      await mount()
      await waitFor(() => expect(button('Usar a sugestão do registro')).toBeDefined())
      await click(button('Usar a sugestão do registro') as HTMLElement)

      const input = document.querySelector<HTMLInputElement>('input[aria-label="Valor"]')
      if (input === null) throw new Error('AMOUNT_NOT_FOUND')
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
      const { act } = await import('react')
      await act(async () => {
        descriptor?.set?.call(input, '5000')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await Promise.resolve()
      })
      await click(button('Salvar acerto') as HTMLElement)
      await settle()

      expect(settlementFakes.recorded[0]?.[0]).toEqual({
        amount: '50.00',
        amountSource: 'manual',
        payerKind: 'driver',
        productCode: '696',
      })
    }),
  )

  test(
    'sem origem dos itens, ou com acerto já gravado, o painel é o de sempre: sem sugestão',
    scenario(async () => {
      installSettlementDouble()
      await mount(ITEMS, false)
      await settle()
      expect(pageText()).not.toContain('Sugestão pelo registro')
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      installSettlementDouble({
        items: [
          {
            amount: '10.0000',
            amountSource: 'manual',
            payerKind: 'driver',
            productCode: '696',
            reimbursedAt: null,
          },
        ],
        total: '10.0000',
      })
      await mount()
      await settle()
      expect(pageText()).not.toContain('Sugestão pelo registro')
    }),
  )

  test(
    'item sem dado da nota nem valor pago não ganha sugestão inventada; sem nenhuma, o bloco não aparece',
    scenario(async () => {
      installSettlementDouble()
      await mount([{ code: '999', description: 'Sem nota', quantity: '1.000', unit: 'CX' }])
      await settle()
      expect(pageText()).not.toContain('Sugestão pelo registro')
      expect(button('Usar a sugestão do registro')).toBeUndefined()
    }),
  )
})

describe('a sugestão do acerto usa o valor copiado e o pago do registro (spec 247 T7.2, M3)', () => {
  /** O preço da nota subiu depois do registro: 57,20 → 70,00. A cópia do registro é a que vale. */
  const REPRICED = PRODUCTS.map((candidate) =>
    candidate.code === '696' ? { ...candidate, unitValue: '70.0000' } : candidate,
  )
  const THREE_UNITS: readonly TripOccurrenceDetailItem[] = [
    { code: '696', description: 'Ovos', quantity: '3.000', unit: 'CX' },
  ]
  const COPIED: readonly TripOccurrenceItemValue[] = [
    { declaredAmount: null, productCode: '696', quantity: '3.000', unitValue: '19.9950' },
  ]

  function reprice(): void {
    tripHookFakes.tripClient = {
      ...tripHookFakes.tripClient,
      readTripDocumentProducts: () => Promise.resolve(REPRICED),
    }
  }

  test(
    '3 × 19,995 do valor copiado sugere 59,99, e não 3 × 70,00 do preço atual',
    scenario(async () => {
      installSettlementDouble()
      reprice()
      await mount(THREE_UNITS, true, { itemValues: COPIED })
      await waitFor(() => expect(button('Usar a sugestão do registro')).toBeDefined())
      await click(button('Usar a sugestão do registro') as HTMLElement)
      expect(amountInputs()).toEqual(['59,99'])
    }),
  )

  test(
    'o valor pago da ocorrência, num código só, vira a sugestão (manual) e vence a soma',
    scenario(async () => {
      installSettlementDouble()
      await mount(THREE_UNITS, true, { declaredAmount: '40.00', itemValues: COPIED })
      await waitFor(() => expect(button('Usar a sugestão do registro')).toBeDefined())
      await click(button('Usar a sugestão do registro') as HTMLElement)
      expect(amountInputs()).toEqual(['40,00'])
      await click(button('Salvar acerto') as HTMLElement)
      await settle()
      expect(settlementFakes.recorded[0]?.[0]?.amountSource).toBe('manual')
    }),
  )

  test(
    'valor pago da ocorrência zero: "a loja não pagou", sem botão e nada preenchido',
    scenario(async () => {
      installSettlementDouble()
      await mount(THREE_UNITS, true, { declaredAmount: '0.00', itemValues: COPIED })
      await waitFor(() => expect(pageText()).toContain('A loja não pagou, sem valor a acertar'))
      expect(button('Usar a sugestão do registro')).toBeUndefined()
      expect(amountInputs()).toEqual([''])
    }),
  )

  test(
    'valor pago da ocorrência com vários códigos: avisa que é da ocorrência inteira e não inventa linhas',
    scenario(async () => {
      installSettlementDouble()
      await mount(ITEMS, true, { declaredAmount: '40.00' })
      await waitFor(() =>
        expect(pageText()).toContain('A loja pagou R$ 40,00 pela ocorrência inteira'),
      )
      expect(button('Usar a sugestão do registro')).toBeUndefined()
    }),
  )
})
