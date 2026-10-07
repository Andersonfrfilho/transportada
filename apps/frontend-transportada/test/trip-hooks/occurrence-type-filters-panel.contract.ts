/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T5.3e (RF11b): a busca e as pílulas montadas de verdade no painel da aba Tipos — contagem, pílulas
 * combinadas, busca por CNPJ com e sem máscara, estado vazio com o motivo e o caminho de volta. Dados sintéticos.
 */
import { readFileSync } from 'node:fs'

import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeCatalogPanel } from '@/modules/trip/components/OccurrenceTypeCatalogPanel.component'
import type {
  OccurrenceAttachmentOverridesByType,
  OccurrenceType,
} from '@/modules/trip/shared/occurrence.constant'

import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { click, stubVisibleLayout, typeQuantity } from './occurrenceCorrectionHarness.helper'
import {
  buildDeliveryClient,
  exceptionDouble,
  installExceptionsDouble,
  resetExceptionsDouble,
} from './occurrenceTypesPanelHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'

const mounted: { unmount: () => void }[] = []
const PONTO_CERTO = '12345678000190'
const STYLES = new URL(
  '../../src/modules/trip/styles/occurrenceTypeFilters.module.css',
  import.meta.url,
)

function buildType(overrides: Partial<OccurrenceType> & Pick<OccurrenceType, 'id' | 'name'>) {
  return {
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'optional',
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    itemsMode: 'optional',
    leavesDocumentBehind: false,
    moments: ['document'],
    notifies: false,
    redeliveryPolicy: 'blocked',
    stage: 'delivery',
    ...overrides,
  } satisfies OccurrenceType
}

const TYPES = [
  buildType({ id: 'type-1', name: 'Recusa total', notifies: true }),
  buildType({ id: 'type-2', moments: ['stop'], name: 'Cliente ausente' }),
  buildType({ active: false, id: 'type-3', name: 'Avaria antiga' }),
]

const BATCH: OccurrenceAttachmentOverridesByType = [
  {
    contractorOverrides: [],
    occurrenceTypeId: 'type-1',
    recipientOverrides: [{ attachmentMode: 'off', taxId: PONTO_CERTO }],
  },
]

function scenario(body: () => Promise<void>): () => Promise<void> {
  return async () => {
    const restoreLayout = stubVisibleLayout()
    try {
      await body()
    } finally {
      restoreLayout()
      for (const rendered of mounted.splice(0)) rendered.unmount()
      resetExceptionsDouble()
    }
  }
}

async function mount(input: Parameters<typeof installExceptionsDouble>[0] = {}): Promise<void> {
  installExceptionsDouble({
    byType: BATCH,
    clients: [
      buildDeliveryClient({ displayName: 'Supermercados Ponto Certo', taxId: PONTO_CERTO }),
    ],
    ...input,
  })
  mounted.push(
    await renderWithQueryClient(
      createElement(OccurrenceTypeCatalogPanel, {
        canManage: true,
        isSaving: false,
        onSave: () => undefined,
        saveFeedbackKey: null,
        types: TYPES,
      }),
    ),
  )
  await waitFor(() => expect(exceptionDouble.batchCalls).toBeGreaterThan(0))
  await waitFor(() => expect(pageText().includes('carregando')).toBe(false))
}

function pageText(): string {
  return document.body.textContent ?? ''
}

function counter(): string {
  const status = [...document.querySelectorAll<HTMLElement>('p[aria-live="polite"]')].find((node) =>
    (node.textContent ?? '').includes(' de '),
  )
  return status?.textContent ?? ''
}

function chip(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find(
    (button) => (button.textContent ?? '').replace(/^[+✓]/u, '').trim() === label,
  )
  if (found === undefined) throw new Error(`CHIP_NOT_FOUND:${label}`)
  return found
}

describe('busca e filtros da aba Tipos (RF11b)', () => {
  test(
    'mostra "N de M tipos" e as pílulas começam desligadas, com aria-pressed',
    scenario(async () => {
      await mount()
      expect(counter()).toBe('3 de 3 tipos')
      expect(chip('Chegada à parada').getAttribute('aria-pressed')).toBe('false')
      expect(chip('Tem exceção').disabled).toBe(false)
    }),
  )

  test(
    'as pílulas se combinam e a contagem acompanha',
    scenario(async () => {
      await mount()
      await click(chip('Entrega da nota'))
      expect(chip('Entrega da nota').getAttribute('aria-pressed')).toBe('true')
      expect(counter()).toBe('2 de 3 tipos')
      await click(chip('Ativos'))
      expect(counter()).toBe('1 de 3 tipos')
      expect(pageText().includes('Recusa total')).toBe(true)
      expect(pageText().includes('Avaria antiga')).toBe(false)
      await click(chip('Tem exceção'))
      expect(counter()).toBe('1 de 3 tipos')
      await click(chip('Não avisa'))
      expect(counter()).toBe('0 de 3 tipos')
    }),
  )

  test(
    'a busca acha o tipo pelo CNPJ da exceção, com e sem máscara',
    scenario(async () => {
      await mount()
      await typeQuantity('Buscar tipos', '12345678000190')
      expect(counter()).toBe('1 de 3 tipos')
      expect(pageText().includes('Recusa total')).toBe(true)
      await typeQuantity('Buscar tipos', '12.345.678/0001-90')
      expect(counter()).toBe('1 de 3 tipos')
      await typeQuantity('Buscar tipos', 'ponto certo')
      expect(counter()).toBe('1 de 3 tipos')
    }),
  )

  test(
    'sem resultado: "Nenhum tipo corresponde", o motivo e o botão que limpa tudo',
    scenario(async () => {
      await mount()
      await typeQuantity('Buscar tipos', 'zzz')
      await click(chip('Ativos'))
      expect(pageText().includes('Nenhum tipo corresponde')).toBe(true)
      expect(pageText().includes('"zzz"')).toBe(true)
      expect(pageText().includes('1 filtro ligado')).toBe(true)
      const clearAll = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent?.trim() === 'Limpar filtros',
      )
      if (clearAll === undefined) throw new Error('CLEAR_ALL_NOT_FOUND')
      await click(clearAll)
      expect(counter()).toBe('3 de 3 tipos')
      expect(chip('Ativos').getAttribute('aria-pressed')).toBe('false')
    }),
  )

  test(
    'exceções que não carregaram: Tem exceção fica desligada com o motivo em texto, e a busca por nome segue',
    scenario(async () => {
      await mount({ failBatch: true })
      await waitFor(() => expect(chip('Tem exceção').disabled).toBe(true))
      const reasonId = chip('Tem exceção').getAttribute('aria-describedby')
      expect(document.getElementById(reasonId ?? '')?.textContent?.includes('indisponível')).toBe(
        true,
      )
      await typeQuantity('Buscar tipos', 'recusa')
      expect(counter()).toBe('1 de 3 tipos')
    }),
  )

  test('as pílulas quebram em linhas e cada grupo ocupa a sua no celular, com alvo de toque de 44px', () => {
    const css = readFileSync(STYLES, 'utf8')
    const desktopStart = css.indexOf('@media (min-width: 40rem)')
    const base = css.slice(0, desktopStart)
    const desktop = css.slice(desktopStart)
    expect(desktopStart).toBeGreaterThan(0)
    expect(base.includes('flex-wrap: wrap')).toBe(true)
    expect(base.includes('overflow-x')).toBe(false)
    expect(base.includes('flex: 1 1 100%')).toBe(true)
    expect(base.includes('min-height: var(--touch-target)')).toBe(true)
    expect(desktop.includes('display: contents')).toBe(true)
  })
})
