/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T7.2 (B1): o rascunho do "Salvar e-mail" (assunto, corpo e linha de item) vive enquanto a página
 * está montada — recolher a linha do tipo (acordeão) e reabri-la não o descarta sem aviso. Salvar o rascunho
 * o encerra, e cada tipo guarda o seu. Montado de verdade. Dados sintéticos.
 */
import { act, createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeCatalogPanel } from '@/modules/trip/components/OccurrenceTypeCatalogPanel.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'

import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { createUnexpectedTripClient } from '../fixtures/tripAssemblyHooks.fixture'
import { click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { expandAllTypes } from './occurrenceTypesPanelHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'
import { tripHookFakes } from './tripClientMocks.helper'

const mounted: { unmount: () => void }[] = []
const SUBJECT_LABEL = 'Assunto'

function buildType(id: string, name: string): OccurrenceType {
  return {
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'off',
    emailBody: 'corpo gravado',
    emailItemLineTemplate: '',
    emailSubject: 'assunto gravado',
    emailTemplateKey: null,
    emailsContractor: true,
    flow: 'document',
    id,
    itemsMode: 'optional',
    leavesDocumentBehind: false,
    name,
    notifies: false,
    redeliveryPolicy: 'blocked',
    stage: 'delivery',
  }
}

function scenario(body: () => Promise<void>): () => Promise<void> {
  return async () => {
    const restoreLayout = stubVisibleLayout()
    tripHookFakes.tripClient = {
      ...createUnexpectedTripClient(),
      previewOccurrenceTypeEmail: () => Promise.resolve({ body: 'corpo', subject: 'assunto' }),
    }
    try {
      await body()
    } finally {
      restoreLayout()
      for (const rendered of mounted.splice(0)) rendered.unmount()
    }
  }
}

async function mount(types: readonly OccurrenceType[]): Promise<void> {
  mounted.push(
    await renderWithQueryClient(
      createElement(OccurrenceTypeCatalogPanel, {
        canManage: true,
        isSaving: false,
        onSave: () => undefined,
        saveFeedbackKey: null,
        types,
      }),
    ),
  )
  await expandAllTypes()
}

function summaries(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('button[aria-controls]')]
}

function subjectFields(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>(`[aria-label="${SUBJECT_LABEL}"]`)]
}

async function typeSubject(index: number, value: string): Promise<void> {
  const target = subjectFields()[index]
  if (target === undefined) throw new Error('SUBJECT_NOT_FOUND')
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(target, value)
    target.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

async function toggleSummary(index: number): Promise<void> {
  const summary = summaries()[index]
  if (summary === undefined) throw new Error('SUMMARY_NOT_FOUND')
  await click(summary)
}

describe('o rascunho do e-mail sobrevive a recolher e reabrir a linha do tipo (spec 247 B1)', () => {
  test(
    'assunto digitado volta ao reabrir, e a linha do outro tipo não o herda',
    scenario(async () => {
      await mount([buildType('type-a', 'Devolução A'), buildType('type-b', 'Devolução B')])
      expect(subjectFields()).toHaveLength(2)
      await typeSubject(0, 'assunto novo {{contratante}}')

      await toggleSummary(0)
      expect(subjectFields()).toHaveLength(1)
      await toggleSummary(0)
      await waitFor(() => expect(subjectFields()).toHaveLength(2))

      expect(subjectFields()[0]?.value).toBe('assunto novo {{contratante}}')
      expect(subjectFields()[1]?.value).toBe('assunto gravado')
    }),
  )

  test(
    'o rascunho devolvido ao gravado deixa de existir: reabrir mostra o gravado',
    scenario(async () => {
      await mount([buildType('type-a', 'Devolução A')])
      await typeSubject(0, 'outro assunto')
      await typeSubject(0, 'assunto gravado')

      await toggleSummary(0)
      await toggleSummary(0)
      await waitFor(() => expect(subjectFields()).toHaveLength(1))
      expect(subjectFields()[0]?.value).toBe('assunto gravado')
    }),
  )
})
