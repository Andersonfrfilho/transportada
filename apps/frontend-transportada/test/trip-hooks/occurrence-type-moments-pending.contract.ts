/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T7.6 (D3): o momento adicionado só vale depois de "Aplicar momentos". A pendência fica
 * à vista num aviso persistente e recolher a linha não descarta o rascunho em silêncio. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeCatalogPanel } from '@/modules/trip/components/OccurrenceTypeCatalogPanel.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeSaveInput } from '@/modules/trip/shared/occurrenceTypeUpdate.service'

import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { buttonByText, click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { expandAllTypes, installExceptionsDouble } from './occurrenceTypesPanelHarness.helper'
import { renderWithQueryClient } from './renderHook.helper'

const NOTICE = 'Mudança nos momentos ainda não aplicada — clique em Aplicar momentos para valer.'
const saved: OccurrenceTypeSaveInput[] = []
const mounted: { unmount: () => void }[] = []

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

function pendingNotice(): Element | null {
  return (
    [...document.querySelectorAll('[role="status"]')].find((node) =>
      node.textContent?.includes('ainda não aplicada'),
    ) ?? null
  )
}

function momentsTrigger(): HTMLElement {
  const trigger = document.querySelector<HTMLElement>(
    'fieldset button[aria-label="Quem registra, e onde"]',
  )
  if (trigger === null) throw new Error('MOMENTS_NOT_FOUND')
  return trigger
}

async function addSeparationMoment(): Promise<void> {
  const trigger = momentsTrigger()
  await click(trigger)
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) =>
    item.textContent?.includes('Separador, no galpão'),
  )
  if (option === undefined) throw new Error('OPTION_NOT_FOUND')
  await click(option)
  await click(trigger)
}

async function mount(): Promise<void> {
  installExceptionsDouble()
  mounted.push(
    await renderWithQueryClient(
      createElement(OccurrenceTypeCatalogPanel, {
        canManage: true,
        isSaving: false,
        loadStatus: 'ready',
        onRetry: () => undefined,
        onSave: (input) => saved.push(input),
        saveFeedbackKey: null,
        types: [buildType()],
      }),
    ),
  )
  await expandAllTypes()
}

function summaryButton(): HTMLElement {
  const summary = document.querySelector<HTMLElement>('fieldset article button[aria-controls]')
  if (summary === null) throw new Error('SUMMARY_NOT_FOUND')
  return summary
}

describe('momentos: mudança pendente à vista (D3)', () => {
  test(
    'sem mudança não há aviso; com mudança aparece o aviso persistente com role=status',
    scenario(async () => {
      await mount()
      expect(pendingNotice()).toBeNull()
      await addSeparationMoment()
      const notice = pendingNotice()
      expect(notice?.textContent).toBe(NOTICE)
      expect(notice?.getAttribute('aria-live')).toBe('polite')
    }),
  )

  test(
    'recolher e reabrir a linha mantém o rascunho e o aviso; Desfazer limpa os dois',
    scenario(async () => {
      await mount()
      await addSeparationMoment()
      await click(summaryButton())
      expect(
        document.querySelector('fieldset button[aria-label="Quem registra, e onde"]'),
      ).toBeNull()
      await click(summaryButton())
      expect(pendingNotice()?.textContent).toBe(NOTICE)
      await click(buttonByText('Desfazer'))
      expect(pendingNotice()).toBeNull()
    }),
  )

  test(
    'Aplicar grava os momentos e o rascunho guardado não volta ao reabrir',
    scenario(async () => {
      await mount()
      await addSeparationMoment()
      await click(buttonByText('Aplicar momentos'))
      expect(saved).toHaveLength(1)
      expect(saved[0]?.moments).toEqual(['separation', 'document'])
      await click(summaryButton())
      await click(summaryButton())
      expect(pendingNotice()).toBeNull()
    }),
  )
})
