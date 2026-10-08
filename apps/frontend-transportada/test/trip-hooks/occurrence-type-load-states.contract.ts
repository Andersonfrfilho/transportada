/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T7.6 (D1): a aba Tipos não pode dizer "nenhum tipo cadastrado" enquanto a lista ainda
 * carrega — na staging havia 13 tipos e a tela afirmava o contrário. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeCatalogPanel } from '@/modules/trip/components/OccurrenceTypeCatalogPanel.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import { readOccurrenceTypeLoadStatus } from '@/modules/trip/shared/occurrenceTypeLoadStatus.service'

import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { installExceptionsDouble } from './occurrenceTypesPanelHarness.helper'
import { renderWithQueryClient } from './renderHook.helper'

const EMPTY_TEXT = 'Nenhum tipo cadastrado ainda'
const mounted: { unmount: () => void }[] = []

function buildType(): OccurrenceType {
  return {
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    active: true,
    allowsMultipleItems: false,
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

async function mount(
  loadStatus: 'error' | 'loading' | 'ready',
  types: readonly OccurrenceType[],
  onRetry: () => void = () => undefined,
): Promise<void> {
  installExceptionsDouble()
  mounted.push(
    await renderWithQueryClient(
      createElement(OccurrenceTypeCatalogPanel, {
        canManage: true,
        isSaving: false,
        loadStatus,
        onRetry,
        onSave: () => undefined,
        saveFeedbackKey: null,
        types,
      }),
    ),
  )
}

function pageText(): string {
  return document.body.textContent ?? ''
}

describe('aba Tipos: carregando, erro, vazio e com tipos (D1)', () => {
  test(
    'carregando: mostra o estado de carregamento acessível e NÃO afirma que não há tipos',
    scenario(async () => {
      await mount('loading', [])
      const status = document.querySelector('[role="status"]')
      expect(status?.textContent).toContain('Carregando tipos')
      expect(pageText()).not.toContain(EMPTY_TEXT)
      expect(document.querySelector('section[aria-label="Novo tipo"]')).toBeNull()
    }),
  )

  test(
    'erro: estado próprio com "Tentar de novo" que chama a nova leitura, sem texto de vazio',
    scenario(async () => {
      let retries = 0
      await mount('error', [], () => {
        retries += 1
      })
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        'Não foi possível carregar os tipos',
      )
      expect(pageText()).not.toContain(EMPTY_TEXT)
      const retry = [...document.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === 'Tentar de novo',
      )
      if (retry === undefined) throw new Error('RETRY_NOT_FOUND')
      await click(retry)
      expect(retries).toBe(1)
    }),
  )

  test(
    'sucesso com lista vazia: só aqui o aviso de vazio aparece',
    scenario(async () => {
      await mount('ready', [])
      expect(pageText()).toContain(EMPTY_TEXT)
      expect(document.querySelector('[role="status"]')).toBeNull()
    }),
  )

  test(
    'sucesso com tipos: lista o tipo, sem vazio nem carregamento',
    scenario(async () => {
      await mount('ready', [buildType()])
      expect(pageText()).toContain('Existente')
      expect(pageText()).not.toContain(EMPTY_TEXT)
      expect(pageText()).not.toContain('Carregando tipos')
    }),
  )
})

describe('readOccurrenceTypeLoadStatus', () => {
  test('mapeia a consulta: sem dado e sem erro é carregando; erro sem dado é erro; sucesso é pronto', () => {
    expect(
      readOccurrenceTypeLoadStatus({ data: undefined, isError: false, isSuccess: false }),
    ).toBe('loading')
    expect(readOccurrenceTypeLoadStatus({ data: undefined, isError: true, isSuccess: false })).toBe(
      'error',
    )
    expect(readOccurrenceTypeLoadStatus({ data: [], isError: false, isSuccess: true })).toBe(
      'ready',
    )
    expect(readOccurrenceTypeLoadStatus({ data: [], isError: true, isSuccess: false })).toBe(
      'ready',
    )
  })
})
