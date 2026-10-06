/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 RF1a/RF1c/RF1c2 (T5.3, 1ª metade): a linha do tipo montada de verdade — os quatro campos
 * no mesmo seletor de três estados, os mínimos só quando o campo é obrigatório, e cada troca gravando
 * só o que mudou (RF4). Dados sintéticos.
 */
import { act, createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeCatalogPanel } from '@/modules/trip/components/OccurrenceTypeCatalogPanel.component'
import { TripOccurrenceTypesTab } from '@/modules/trip/components/TripOccurrenceTypesTab.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeSaveInput } from '@/modules/trip/shared/occurrenceTypeUpdate.service'

import { createUnexpectedTripClient } from '../fixtures/tripAssemblyHooks.fixture'
import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { expandAllTypes } from './occurrenceTypesPanelHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'
import { tripHookFakes } from './tripClientMocks.helper'

const saved: OccurrenceTypeSaveInput[] = []
const mounted: { unmount: () => void }[] = []

function buildType(overrides: Partial<OccurrenceType> = {}): OccurrenceType {
  return {
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'off',
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    id: 'type-1',
    itemsMode: 'optional',
    leavesDocumentBehind: false,
    name: 'Recusa total',
    notifies: false,
    redeliveryPolicy: 'blocked',
    stage: 'delivery',
    ...overrides,
  }
}

function scenario(body: () => Promise<void>): () => Promise<void> {
  return async () => {
    const restoreLayout = stubVisibleLayout()
    try {
      await body()
    } finally {
      restoreLayout()
      for (const rendered of mounted.splice(0)) rendered.unmount()
      saved.length = 0
    }
  }
}

async function mount(type: OccurrenceType): Promise<void> {
  mounted.push(
    await renderWithQueryClient(
      createElement(OccurrenceTypeCatalogPanel, {
        canManage: true,
        isSaving: false,
        onSave: (input) => saved.push(input),
        saveFeedbackKey: null,
        types: [type],
      }),
    ),
  )
  await expandAllTypes()
}

function control(label: string): HTMLElement | null {
  const row = document.querySelector('fieldset') ?? document
  return row.querySelector<HTMLElement>(`button[aria-label="${label}"]`)
}

function shows(label: string, mode: string): boolean {
  return control(label)?.textContent?.includes(mode) === true
}

async function choose(controlLabel: string, optionText: string): Promise<void> {
  const trigger = control(controlLabel)
  if (trigger === null) throw new Error(`CONTROL_NOT_FOUND:${controlLabel}`)
  await click(trigger)
  let option: HTMLElement | undefined
  await waitFor(() => {
    option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (candidate) => candidate.textContent?.trim() === optionText,
    )
    expect(option === undefined).toBe(false)
  })
  if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${optionText}`)
  await click(option)
}

const NEW_KEYS = ['itemsMinimumCount', 'noteMode', 'photoMinimumCount', 'signatureMode'] as const

describe('linha do tipo: os quatro campos de exigência (spec 246 RF1a)', () => {
  test(
    'tipo de rua mostra Foto, Observação, Assinatura e Produtos com o que está gravado',
    scenario(async () => {
      await mount(
        buildType({
          attachmentMode: 'required',
          itemsMode: 'required',
          noteMode: 'optional',
          signatureMode: 'off',
        }),
      )
      expect(shows('Foto', 'Obrigatório')).toBe(true)
      expect(shows('Observação', 'Opcional')).toBe(true)
      expect(shows('Assinatura', 'Desligado')).toBe(true)
      expect(shows('Produtos', 'Obrigatório')).toBe(true)
    }),
  )

  test(
    'tipo de galpão só mostra Produtos; API sem itemsMode não oferece Produtos',
    scenario(async () => {
      await mount(buildType({ stage: 'separation' }))
      expect(control('Foto')).toBeNull()
      expect(control('Observação')).toBeNull()
      expect(control('Assinatura')).toBeNull()
      expect(control('Produtos')).not.toBeNull()
    }),
  )

  test(
    'trocar Assinatura grava só signatureMode, sem nenhum dos outros campos novos',
    scenario(async () => {
      await mount(buildType())
      await choose('Assinatura', 'Obrigatório')
      expect(saved).toHaveLength(1)
      expect(saved[0]?.signatureMode).toBe('required')
      for (const key of NEW_KEYS.filter((candidate) => candidate !== 'signatureMode')) {
        expect(saved[0]).not.toHaveProperty(key)
      }
    }),
  )

  test(
    'trocar Observação grava só noteMode',
    scenario(async () => {
      await mount(buildType())
      await choose('Observação', 'Obrigatório')
      expect(saved[0]?.noteMode).toBe('required')
      expect(saved[0]).not.toHaveProperty('signatureMode')
    }),
  )
})

describe('linha do tipo: os mínimos (spec 246 RF1c, RF1c2)', () => {
  test(
    'mínimo de fotos só com Foto obrigatório, e a troca grava photoMinimumCount',
    scenario(async () => {
      await mount(buildType({ attachmentMode: 'optional' }))
      expect(control('Quantidade mínima de fotos')).toBeNull()
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      await mount(buildType({ attachmentMode: 'required', photoMinimumCount: 2 }))
      expect(shows('Quantidade mínima de fotos', '2')).toBe(true)
      await choose('Quantidade mínima de fotos', '4')
      expect(saved).toHaveLength(1)
      expect(saved[0]?.photoMinimumCount).toBe(4)
    }),
  )

  test(
    'mínimo de produtos só com Produtos obrigatório; "Todos os itens" grava nulo, "Ao menos" grava 1',
    scenario(async () => {
      await mount(buildType({ itemsMode: 'optional' }))
      expect(control('Produtos exigidos')).toBeNull()
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      await mount(buildType({ itemsMinimumCount: 2, itemsMode: 'required' }))
      expect(shows('Produtos exigidos', 'Ao menos')).toBe(true)
      expect(
        document.querySelector('input[aria-label="Quantidade mínima de produtos"]'),
      ).not.toBeNull()
      await choose('Produtos exigidos', 'Todos os itens da nota')
      expect(saved[0]?.itemsMinimumCount).toBeNull()
      expect(saved[0]).toHaveProperty('itemsMinimumCount')
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      await mount(buildType({ itemsMinimumCount: null, itemsMode: 'required' }))
      expect(document.querySelector('input[aria-label="Quantidade mínima de produtos"]')).toBeNull()
      await choose('Produtos exigidos', 'Ao menos N itens')
      expect(saved[1]?.itemsMinimumCount).toBe(1)
    }),
  )

  test(
    'tornar Produtos obrigatório não manda mínimo; sair de obrigatório manda o mínimo nulo',
    scenario(async () => {
      await mount(buildType({ itemsMode: 'optional' }))
      await choose('Produtos', 'Obrigatório')
      expect(saved[0]?.itemsMode).toBe('required')
      expect(saved[0]).not.toHaveProperty('itemsMinimumCount')
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      await mount(buildType({ itemsMinimumCount: 3, itemsMode: 'required' }))
      await choose('Produtos', 'Opcional')
      expect(saved[1]?.itemsMode).toBe('optional')
      expect(saved[1]).toHaveProperty('itemsMinimumCount')
      expect(saved[1]?.itemsMinimumCount).toBeNull()
    }),
  )

  test(
    'o campo numérico grava ao sair, e valor fora da faixa volta ao gravado sem gravar',
    scenario(async () => {
      await mount(buildType({ itemsMinimumCount: 2, itemsMode: 'required' }))
      const input = document.querySelector<HTMLInputElement>(
        'input[aria-label="Quantidade mínima de produtos"]',
      )
      if (input === null) throw new Error('INPUT_NOT_FOUND')
      const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
      async function leaveWith(value: string): Promise<void> {
        await act(async () => {
          valueDescriptor?.set?.call(input, value)
          input?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
          await Promise.resolve()
        })
      }

      await leaveWith('0')
      expect(saved).toHaveLength(0)
      expect(input.value).toBe('2')

      await leaveWith('5')
      expect(saved).toHaveLength(1)
      expect(saved[0]?.itemsMinimumCount).toBe(5)
    }),
  )
})

describe('a aba Tipos monta o painel com a lista da API (spec 246 RF10)', () => {
  test(
    'lê os tipos pelo cliente e mostra a linha com os quatro campos',
    scenario(async () => {
      tripHookFakes.tripClient = {
        ...createUnexpectedTripClient(),
        listOccurrenceTypes: () => Promise.resolve([buildType({ name: 'Avaria na rua' })]),
      }
      mounted.push(
        await renderWithQueryClient(createElement(TripOccurrenceTypesTab, { canManage: true })),
      )

      await waitFor(() => expect(document.body.textContent?.includes('Avaria na rua')).toBe(true))
      await expandAllTypes()
      expect(control('Foto') !== null && control('Produtos') !== null).toBe(true)
    }),
  )

  test(
    'sem companies.settings a aba não consulta o catálogo',
    scenario(async () => {
      let isRead = false
      tripHookFakes.tripClient = {
        ...createUnexpectedTripClient(),
        listOccurrenceTypes: () => {
          isRead = true
          return Promise.resolve([])
        },
      }
      mounted.push(
        await renderWithQueryClient(createElement(TripOccurrenceTypesTab, { canManage: false })),
      )
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })
      expect(isRead).toBe(false)
    }),
  )
})
