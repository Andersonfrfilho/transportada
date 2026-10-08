/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T7.6 (D2): campo que some sem explicação parece campo perdido. Reentrega e "Aceita vários
 * itens" dependem de Produtos ligado; "A viagem segue sem a nota" só existe em tipo do galpão. A tela
 * diz o motivo no lugar — a regra de quem aparece não muda. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeCatalogPanel } from '@/modules/trip/components/OccurrenceTypeCatalogPanel.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'

import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import {
  chooseFrom,
  expandAllTypes,
  installExceptionsDouble,
} from './occurrenceTypesPanelHarness.helper'
import { renderWithQueryClient } from './renderHook.helper'

const ITEMS_HINT =
  'Reentrega e “Aceita vários itens” só aparecem quando Produtos está Opcional ou Obrigatório.'
const SEPARATION_ONLY_HINT =
  '“A viagem segue sem a nota” só existe para tipos registrados no galpão'
const mounted: { unmount: () => void }[] = []

function buildType(overrides: Partial<OccurrenceType>): OccurrenceType {
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
    itemsMode: 'off',
    leavesDocumentBehind: false,
    moments: ['document'],
    name: 'Existente',
    notifies: false,
    redeliveryPolicy: 'unset',
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
        loadStatus: 'ready',
        onRetry: () => undefined,
        onSave: () => undefined,
        saveFeedbackKey: null,
        types,
      }),
    ),
  )
  await expandAllTypes()
}

function typeRowText(): string {
  return document.querySelector('fieldset')?.textContent ?? ''
}

function createFormText(): string {
  return document.querySelector('section[aria-label="Novo tipo"]')?.textContent ?? ''
}

describe('dica de campos que não aparecem (D2)', () => {
  test(
    'tipo da rua com Produtos desligado: explica reentrega/vários itens e "segue sem a nota"',
    scenario(async () => {
      await mount([buildType({})])
      expect(typeRowText()).toContain(ITEMS_HINT)
      expect(typeRowText()).toContain(SEPARATION_ONLY_HINT)
      expect(typeRowText()).not.toContain('A viagem segue sem a nota ')
    }),
  )

  test(
    'tipo da rua com Produtos ligado: omite a dica de Produtos e mantém a do galpão',
    scenario(async () => {
      await mount([buildType({ itemsMode: 'optional', redeliveryPolicy: 'blocked' })])
      expect(typeRowText()).not.toContain(ITEMS_HINT)
      expect(typeRowText()).toContain(SEPARATION_ONLY_HINT)
    }),
  )

  test(
    'tipo do galpão com Produtos desligado: só a dica de Produtos; a caixa "segue sem a nota" existe',
    scenario(async () => {
      await mount([buildType({ moments: ['separation'], stage: 'separation' })])
      expect(typeRowText()).toContain(ITEMS_HINT)
      expect(typeRowText()).not.toContain(SEPARATION_ONLY_HINT)
      expect(typeRowText()).toContain('A viagem segue sem a nota')
    }),
  )

  test(
    'formulário Novo tipo: a dica de Produtos acompanha o seletor e some ao ligar Produtos',
    scenario(async () => {
      await mount([buildType({ itemsMode: 'optional' })])
      const form = document.querySelector('section[aria-label="Novo tipo"]')
      const products = form?.querySelector<HTMLElement>('button[aria-label="Produtos"]')
      if (products === null || products === undefined) throw new Error('PRODUCTS_NOT_FOUND')
      expect(createFormText()).not.toContain(ITEMS_HINT)
      await chooseFrom(products, 'Desligado')
      expect(createFormText()).toContain(ITEMS_HINT)
      await chooseFrom(products, 'Opcional')
      expect(createFormText()).not.toContain(ITEMS_HINT)
    }),
  )

  test(
    'formulário Novo tipo com momento da rua: explica por que "segue sem a nota" não aparece',
    scenario(async () => {
      await mount([buildType({ itemsMode: 'optional' })])
      expect(createFormText()).not.toContain(SEPARATION_ONLY_HINT)
      const trigger = document.querySelector<HTMLElement>(
        'section[aria-label="Novo tipo"] button[aria-label="Quem registra, e onde"]',
      )
      if (trigger === null) throw new Error('MOMENTS_NOT_FOUND')
      for (const label of ['Motorista, numa nota', 'Separador, no galpão']) {
        await click(trigger)
        const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) =>
          item.textContent?.includes(label),
        )
        if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${label}`)
        await click(option)
        await click(trigger)
      }
      expect(createFormText()).toContain(SEPARATION_ONLY_HINT)
    }),
  )
})
