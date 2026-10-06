/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 RF8/CA06: o registro de ocorrência montado de verdade. Tipo `off` não mostra o seletor de
 * produtos nem as quantidades, e trocar para ele leva a seleção embora. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { TripOccurrences } from '@/modules/trip/components/TripOccurrences.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { TripDocumentProduct } from '@/modules/trip/shared/trip.types'

import { buttonByText, click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'
import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'

function buildType(overrides: Partial<OccurrenceType> & Pick<OccurrenceType, 'id' | 'name'>) {
  return {
    active: true,
    allowsMultipleItems: true,
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    attachmentMode: 'off',
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    leavesDocumentBehind: false,
    notifies: false,
    redeliveryPolicy: 'unset',
    stage: 'separation',
    ...overrides,
  } satisfies OccurrenceType
}

const PRODUCTS: readonly TripDocumentProduct[] = ['696', '697'].map((code, index) => ({
  code,
  commercialUnit: 'CX',
  description: `Produto ${code}`,
  ordinal: index + 1,
  quantity: '10.000',
  totalValue: '10.00',
  unitValue: '1.00',
}))

const DAMAGE = buildType({ id: 'type-damage', name: 'Avaria', itemsMode: 'optional' })
const DAMAGE_WITHOUT_MODE = buildType({ id: 'type-legacy', name: 'Avaria antiga' })
const EXTENSION = buildType({ id: 'type-extension', name: 'Prorrogação', itemsMode: 'off' })

const mounted: { unmount: () => void }[] = []

function unmountAll(): void {
  for (const rendered of mounted.splice(0)) rendered.unmount()
}

/**
 * Sem `beforeEach`/`afterEach`: no lote DOM esses ganchos viram globais e atingem os testes dos
 * outros contratos. Cada cenário remenda o layout, desmonta e desfaz no próprio `finally`.
 */
function scenario(body: () => Promise<void>): () => Promise<void> {
  return async () => {
    const restoreLayout = stubVisibleLayout()
    try {
      await body()
    } finally {
      restoreLayout()
      unmountAll()
    }
  }
}

async function mount(types: readonly OccurrenceType[]): Promise<void> {
  const rendered = await renderWithQueryClient(
    createElement(TripOccurrences, {
      canRegister: true,
      email: null,
      isRegistering: false,
      occurrences: [],
      onRegister: () => Promise.resolve({ hasFailure: false }),
      onReset: () => undefined,
      photoSendState: [],
      products: PRODUCTS,
      types,
    }),
  )
  mounted.push(rendered)
  await click(buttonByText('Registrar ocorrência'))
}

function hasProductSelect(): boolean {
  return document.querySelector('button[aria-label="Item da nota"]') !== null
}

async function chooseType(name: string): Promise<void> {
  const trigger = document.querySelector<HTMLElement>('button[aria-label="Tipo de ocorrência"]')
  if (trigger === null) throw new Error('TYPE_TRIGGER_NOT_FOUND')
  await click(trigger)
  let option: HTMLElement | undefined
  await waitFor(() => {
    option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (candidate) => candidate.textContent?.includes(name) === true,
    )
    expect(option === undefined).toBe(false)
  })
  if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${name}`)
  await click(option)
}

describe('registro de ocorrência por tipo (spec 241 RF8, CA06)', () => {
  test(
    'tipo optional mostra o seletor de produtos',
    scenario(async () => {
      await mount([DAMAGE])
      await waitFor(() => expect(hasProductSelect()).toBe(true))
    }),
  )

  test(
    'tipo sem itemsMode (API anterior) mostra o seletor, como hoje',
    scenario(async () => {
      await mount([DAMAGE_WITHOUT_MODE])
      await waitFor(() => expect(hasProductSelect()).toBe(true))
    }),
  )

  test(
    'tipo off não mostra o seletor de produtos',
    scenario(async () => {
      await mount([EXTENSION])
      await waitFor(() =>
        expect(document.querySelector('[aria-label="Tipo de ocorrência"]') !== null).toBe(true),
      )
      expect(hasProductSelect()).toBe(false)
    }),
  )

  test(
    'trocar de optional para off esconde o seletor, e voltar o mostra',
    scenario(async () => {
      await mount([DAMAGE, EXTENSION])
      await waitFor(() => expect(hasProductSelect()).toBe(true))
      await chooseType('Prorrogação')
      await waitFor(() => expect(hasProductSelect()).toBe(false))
      await chooseType('Avaria')
      await waitFor(() => expect(hasProductSelect()).toBe(true))
    }),
  )
})
