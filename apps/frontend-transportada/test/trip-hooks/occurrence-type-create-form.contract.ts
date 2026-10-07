/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (revisão do painel M4): o cadastro do tipo novo fala o vocabulário da RF1a — Foto, Observação,
 * Assinatura e Produtos em Desligado/Opcional/Obrigatório, mais os momentos —, sem "Fluxo de registro"
 * nem "Foto do comprovante". Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeCatalogPanel } from '@/modules/trip/components/OccurrenceTypeCatalogPanel.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeSaveInput } from '@/modules/trip/shared/occurrenceTypeUpdate.service'

import {
  OCCURRENCE_REQUIREMENT_DEFAULTS,
  withoutFields,
} from '../fixtures/occurrenceRequirementDefaults.fixture'
import { click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { chooseFrom, installExceptionsDouble } from './occurrenceTypesPanelHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'

const saved: OccurrenceTypeSaveInput[] = []
const mounted: { unmount: () => void }[] = []
const MOMENTS = 'Quem registra, e onde'

function buildType(): OccurrenceType {
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
    moments: ['document'],
    name: 'Existente',
    notifies: false,
    redeliveryPolicy: 'unset',
    stage: 'delivery',
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

async function mount(types: readonly OccurrenceType[]): Promise<void> {
  installExceptionsDouble()
  mounted.push(
    await renderWithQueryClient(
      createElement(OccurrenceTypeCatalogPanel, {
        canManage: true,
        isSaving: false,
        onSave: (input) => saved.push(input),
        saveFeedbackKey: null,
        types,
      }),
    ),
  )
}

function form(): HTMLElement {
  const section = document.querySelector<HTMLElement>('section[aria-label="Novo tipo"]')
  if (section === null) throw new Error('CREATE_FORM_NOT_FOUND')
  return section
}

function control(label: string): HTMLElement | null {
  return form().querySelector<HTMLElement>(`button[aria-label="${label}"]`)
}

async function toggleMoment(text: string): Promise<void> {
  const trigger = control(MOMENTS)
  if (trigger === null) throw new Error('MOMENTS_NOT_FOUND')
  await click(trigger)
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) =>
    item.textContent?.includes(text),
  )
  if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${text}`)
  await click(option)
  await click(trigger)
}

async function fillNameAndAdd(name: string): Promise<void> {
  const input = form().querySelector<HTMLInputElement>('input[type="text"]')
  if (input === null) throw new Error('NAME_NOT_FOUND')
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  const { act } = await import('react')
  await act(async () => {
    descriptor?.set?.call(input, name)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
  const add = [...form().querySelectorAll<HTMLElement>('button')].find(
    (button) => button.textContent?.trim() === 'Cadastrar tipo',
  )
  if (add === undefined) throw new Error('ADD_NOT_FOUND')
  await click(add)
}

describe('cadastro do tipo novo: o vocabulário da RF1a (M4)', () => {
  test(
    'mostra Foto, Observação, Assinatura e Produtos e os momentos; não mostra Fluxo de registro, Foto do comprovante nem Onde acontece',
    scenario(async () => {
      await mount([buildType()])
      await toggleMoment('Motorista, numa nota')
      for (const label of ['Foto', 'Observação', 'Assinatura', 'Produtos', MOMENTS]) {
        expect(control(label) !== null).toBe(true)
      }
      for (const label of ['Fluxo de registro', 'Foto do comprovante', 'Onde acontece']) {
        expect(control(label) === null).toBe(true)
      }
      await chooseFrom(control('Observação') as HTMLElement, 'Obrigatório')
      expect(control('Observação')?.textContent?.includes('Obrigatório')).toBe(true)
    }),
  )

  test(
    'grava momentos, os quatro modos, e o grupo e o fluxo derivados dos momentos',
    scenario(async () => {
      await mount([buildType()])
      await toggleMoment('Motorista, numa nota')
      await toggleMoment('Separador, no galpão')
      await chooseFrom(control('Foto') as HTMLElement, 'Obrigatório')
      await fillNameAndAdd('Recusa na porta')

      await waitFor(() => expect(saved).toHaveLength(1))
      const created = saved[0]
      expect(created?.moments).toEqual(['document'])
      expect(created?.stage).toBe('delivery')
      expect(created?.flow).toBe('document')
      expect(created?.attachmentMode).toBe('required')
      expect(created?.noteMode).toBe('optional')
      expect(created?.signatureMode).toBe('off')
      expect(created?.itemsMode).toBe('optional')
      expect(created?.occurrenceTypeId).toBeNull()
    }),
  )

  test(
    'tipo só de parada pede só a Foto e grava flow stop',
    scenario(async () => {
      await mount([buildType()])
      await toggleMoment('Motorista, na parada')
      await toggleMoment('Separador, no galpão')
      expect(control('Foto') !== null).toBe(true)
      for (const label of ['Observação', 'Assinatura', 'Produtos']) {
        expect(control(label) === null).toBe(true)
      }
      await fillNameAndAdd('Espera na doca')
      await waitFor(() => expect(saved).toHaveLength(1))
      expect(saved[0]?.flow).toBe('stop')
      expect(saved[0]?.stage).toBe('delivery')
    }),
  )

  test(
    'momentos recusados desligam o botão, com o motivo à vista',
    scenario(async () => {
      await mount([buildType()])
      await toggleMoment('Separador, no galpão')
      const add = [...form().querySelectorAll<HTMLElement>('button')].find(
        (button) => button.textContent?.trim() === 'Cadastrar tipo',
      )
      expect(add?.hasAttribute('disabled')).toBe(true)
      expect(form().textContent?.includes('Escolha ao menos um momento')).toBe(true)
    }),
  )

  test(
    'API anterior aos campos: o cadastro não oferece Observação nem Assinatura e não manda moments',
    scenario(async () => {
      const old = withoutFields(buildType(), [
        'moments',
        'noteMode',
        'photoMinimumCount',
        'signatureMode',
      ])
      await mount([old])
      expect(control('Observação') === null).toBe(true)
      expect(control('Assinatura') === null).toBe(true)
      expect(control(MOMENTS) === null).toBe(true)
      await fillNameAndAdd('Tipo antigo')
      await waitFor(() => expect(saved).toHaveLength(1))
      for (const key of ['moments', 'noteMode', 'signatureMode']) {
        expect(saved[0]).not.toHaveProperty(key)
      }
    }),
  )
})
