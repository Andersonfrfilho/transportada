/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 RF10/RF12/CA10: o cadastro de tipos montado de verdade. Produtos (Sem produtos / Produtos opcionais)
 * só aparece quando a listagem trouxe `itemsMode`; com Desligado a política de reentrega some e a
 * gravação leva `redeliveryPolicy: 'unset'`. Dados sintéticos.
 */
import { act, createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import {
  OccurrenceTypeCatalogPanel,
  type OccurrenceTypeCatalogPanelProps,
} from '@/modules/company-settings/components/OccurrenceTypeCatalogPanel.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'

import { buttonByText, click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'

type SavedType = Parameters<OccurrenceTypeCatalogPanelProps['onSave']>[0]

const PRODUCTS_LABEL = 'Produtos'
const POLICY_LABEL = 'Admite reentrega'
const MULTIPLE_ITEMS_LABEL = 'Aceita vários itens'

function buildType(overrides: Partial<OccurrenceType> = {}): OccurrenceType {
  return {
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'off',
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    id: 'type-1',
    leavesDocumentBehind: false,
    name: 'Avaria',
    notifies: false,
    redeliveryPolicy: 'blocked',
    stage: 'delivery',
    ...overrides,
  }
}

const saved: SavedType[] = []
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
      saved.length = 0
    }
  }
}

async function mount(types: readonly OccurrenceType[]): Promise<void> {
  const rendered = await renderWithQueryClient(
    createElement(OccurrenceTypeCatalogPanel, {
      canManage: true,
      isSaving: false,
      onSave: (input) => saved.push(input),
      saveFeedbackKey: null,
      types,
    }),
  )
  mounted.push(rendered)
}

async function typeName(value: string): Promise<void> {
  const nameInput = document.querySelector<HTMLInputElement>('input[aria-label="Nome do tipo"]')
  if (nameInput === null) throw new Error('NAME_INPUT_NOT_FOUND')
  const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  await act(async () => {
    valueDescriptor?.set?.call(nameInput, value)
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

/** O tipo listado mora no fieldset; o formulário de cadastro novo mora fora dele. */
function typeRow(): ParentNode {
  return document.querySelector('fieldset') ?? document
}

function creationForm(): ParentNode {
  const nameInput = document.querySelector('input[aria-label="Nome do tipo"]')
  if (nameInput?.parentElement == null) throw new Error('CREATION_FORM_NOT_FOUND')
  return nameInput.parentElement
}

function control(label: string, root: ParentNode = typeRow()): HTMLElement | null {
  return root.querySelector<HTMLElement>(`button[aria-label="${label}"]`)
}

function checkboxLabelled(label: string): boolean {
  return [...typeRow().querySelectorAll('label')].some((node) => node.textContent?.trim() === label)
}

async function choose(
  controlLabel: string,
  optionText: string,
  root: ParentNode = typeRow(),
): Promise<void> {
  const trigger = control(controlLabel, root)
  if (trigger === null) throw new Error(`CONTROL_NOT_FOUND:${controlLabel}`)
  await click(trigger)
  let option: HTMLElement | undefined
  await waitFor(() => {
    option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (candidate) => candidate.textContent?.includes(optionText) === true,
    )
    expect(option === undefined).toBe(false)
  })
  if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${optionText}`)
  await click(option)
}

describe('cadastro de tipos: Produtos (spec 241 RF10)', () => {
  test(
    'listagem sem itemsMode (API anterior): nada de Produtos, a política segue ali',
    scenario(async () => {
      await mount([buildType()])
      expect(control(PRODUCTS_LABEL)).toBeNull()
      expect(control(POLICY_LABEL)).not.toBeNull()
      expect(checkboxLabelled(MULTIPLE_ITEMS_LABEL)).toBe(true)
    }),
  )

  test(
    'listagem com itemsMode: Produtos aparece no tipo, com a escolha gravada',
    scenario(async () => {
      await mount([buildType({ itemsMode: 'optional' })])
      expect(control(PRODUCTS_LABEL)?.textContent).toContain('Produtos opcionais')
      expect(checkboxLabelled(MULTIPLE_ITEMS_LABEL)).toBe(true)
    }),
  )

  test(
    'tipo Desligado: a política de reentrega e o "um ou vários" somem',
    scenario(async () => {
      await mount([buildType({ itemsMode: 'off', redeliveryPolicy: 'unset' })])
      expect(control(PRODUCTS_LABEL)?.textContent).toContain('Sem produtos')
      expect(control(POLICY_LABEL)).toBeNull()
      expect(checkboxLabelled(MULTIPLE_ITEMS_LABEL)).toBe(false)
    }),
  )

  test(
    'trocar para Desligado grava itemsMode off e redeliveryPolicy unset no mesmo PUT (RF12)',
    scenario(async () => {
      await mount([buildType({ itemsMode: 'optional', redeliveryPolicy: 'blocked' })])
      await choose(PRODUCTS_LABEL, 'Sem produtos')
      expect(saved).toEqual([
        {
          active: true,
          allowsMultipleItems: true,
          attachmentMode: 'off',
          emailTemplateKey: null,
          itemsMode: 'off',
          leavesDocumentBehind: false,
          name: 'Avaria',
          notifies: false,
          occurrenceTypeId: 'type-1',
          redeliveryPolicy: 'unset',
          stage: 'delivery',
        },
      ])
    }),
  )

  test(
    'voltar para Opcional grava itemsMode optional e mantém a política já gravada',
    scenario(async () => {
      await mount([buildType({ itemsMode: 'off', redeliveryPolicy: 'unset' })])
      await choose(PRODUCTS_LABEL, 'Produtos opcionais')
      expect(saved).toHaveLength(1)
      expect(saved[0]?.itemsMode).toBe('optional')
      expect(saved[0]?.redeliveryPolicy).toBe('unset')
    }),
  )

  test(
    'as outras gravações não mandam itemsMode: ausente é "não mexa" (RF4 da API)',
    scenario(async () => {
      await mount([buildType({ itemsMode: 'optional' })])
      await click(
        [...document.querySelectorAll<HTMLElement>('label')].find(
          (node) => node.textContent?.trim() === 'Avisar quando acontecer',
        )!,
      )
      expect(saved).toHaveLength(1)
      expect(saved[0]).not.toHaveProperty('itemsMode')
    }),
  )
})

describe('cadastro de tipos: criar a prorrogação (spec 241 CA10)', () => {
  test(
    'Produtos Desligado, sem foto, sem soltar a nota: o corpo é o da segunda via, sem política',
    scenario(async () => {
      await mount([buildType({ id: 'existing', itemsMode: 'off', redeliveryPolicy: 'unset' })])
      expect(control(POLICY_LABEL, creationForm())).not.toBeNull()

      await typeName('Cliente pediu prorrogação do boleto')
      await choose('Onde acontece', 'Na rua', creationForm())
      expect(control(POLICY_LABEL, creationForm())).not.toBeNull()
      await choose(PRODUCTS_LABEL, 'Sem produtos', creationForm())
      expect(control(POLICY_LABEL, creationForm())).toBeNull()

      await click(buttonByText('Cadastrar tipo'))

      expect(saved).toEqual([
        {
          active: true,
          allowsMultipleItems: true,
          attachmentMode: 'off',
          emailTemplateKey: null,
          flow: 'document',
          itemsMode: 'off',
          leavesDocumentBehind: false,
          name: 'Cliente pediu prorrogação do boleto',
          notifies: false,
          occurrenceTypeId: null,
          redeliveryPolicy: 'unset',
          stage: 'delivery',
        },
      ])
    }),
  )

  test(
    'política já escolhida some com Produtos Desligado: o corpo leva unset, não o que estava na tela',
    scenario(async () => {
      await mount([buildType({ id: 'existing', itemsMode: 'optional' })])
      await typeName('Prorrogação')
      await choose(POLICY_LABEL, 'Não admite reentrega', creationForm())
      await choose(PRODUCTS_LABEL, 'Sem produtos', creationForm())
      await click(buttonByText('Cadastrar tipo'))

      expect(saved).toHaveLength(1)
      expect(saved[0]?.itemsMode).toBe('off')
      expect(saved[0]?.redeliveryPolicy).toBe('unset')
    }),
  )

  test(
    'sem nenhuma listagem com itemsMode, o cadastro novo não oferece Produtos nem o manda',
    scenario(async () => {
      await mount([buildType()])
      expect(control(PRODUCTS_LABEL, creationForm())).toBeNull()
    }),
  )
})
